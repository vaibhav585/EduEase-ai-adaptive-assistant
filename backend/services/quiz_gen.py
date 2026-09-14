"""LLM quiz generation with disability-adapted item formats.

Replaces the Phase 0 generator, which blanked a random noun out of a sentence and
offered three random other nouns as distractors. That produced items that were
often unanswerable, sometimes had two correct options, and never set `topic` —
so the "Focus Areas to Improve" panel was permanently empty.

Every item also carries a SIMPLER VARIANT. Phase 2.4 serves it when the error
classifier reports COMPREHENSION_BARRIER, which is the closed loop that makes the
DASE work novel rather than just another scoring formula.
"""

import random
import re
from typing import Dict, List, Optional

from services.cache import get_or_compute, make_key
from services.llm import LLMUnavailable, call_json

N_OPTIONS = 4

BASE_RULES = f"""You write multiple-choice questions that test whether a student
understood a lesson.

RULES:
1. Every question must be answerable from the given text alone.
2. Exactly ONE option is correct. The other {N_OPTIONS - 1} must be clearly wrong to someone
   who understood the text, but plausible to someone who did not.
3. Distractors must be the same kind of thing as the answer (if the answer is a date,
   all options are dates) and similar in length. Never make the correct option the longest.
4. Test understanding, not word-matching. Do not copy a sentence and blank out a word.
5. `topic` is a 2-4 word human-readable label for what the question tests.
6. `conceptId` is a short snake_case id, reused across questions testing the same concept.
7. `difficulty` is 1 (recall) to 5 (applies the idea to a new situation).
8. Provide a SIMPLER VARIANT of each question: the same concept, but with easier wording,
   shorter sentences, and more obviously-wrong distractors. It is shown to a student who
   did not understand the original question's phrasing.
9. The simpler variant must obey the STUDENT PROFILE rules below at least as strictly as
   the main question — it is read by the SAME student when they are already struggling.
   Never introduce abbreviations, symbols, or compressed notation ("In:/Out:", "CO2", "->")
   in the simpler variant. Spell everything out in words.
"""

# How items themselves are built for each profile — this is the "Deaf-Specific
# Assessment Mode" and its equivalents from the research doc, not just styling.
FORMATS: Dict[str, str] = {
    "default": "Use clear, standard phrasing.",
    "blind": """This student is blind and will HEAR the question read aloud.
- Never reference diagrams, images, colours, positions or layout.
- No "which of the following is shown", no spatial or geometric reasoning items.
- Spell out symbols in words ("percent", not "%").
- Keep each option under 12 words and make options easy to tell apart by ear —
  they must not all start with the same phrase.""",
    "deaf": """This student is Deaf and reads at about a 4th-grade level.
- Keep the question stem under 15 words. Use common concrete words only.
- No idioms, metaphors or figurative language anywhere.
- Prefer questions about relationships, sequences, matching and categories.
- Keep every option under 8 words.
- Minimise reading load: never require reading a paragraph to answer.""",
    "dyslexia": """This student has dyslexia.
- Question stem under 15 words, in short simple sentences.
- Options under 8 words each.
- Options must not look alike — avoid near-identical spellings or similar-looking words.
- No double negatives and no "which is NOT" phrasing.""",
    "adhd": """This student has ADHD.
- One-step questions only. Never require holding several facts at once.
- Stem under 15 words, with the key term in **bold**.
- No "all of the above" or "none of the above".""",
    "autism": """This student is autistic.
- Completely literal and unambiguous. No figurative language.
- Exactly one defensibly correct answer — never "which is the BEST answer" or
  questions that turn on nuance or social judgement.
- Use the same term for a concept as the lesson used.
- Avoid vague quantifiers like "often" or "some".""",
    "dyscalculia": """This student has dyscalculia.
- Break any calculation into a single step per question.
- State what each number counts ("12 students", never a bare "12").
- Use words instead of notation ("5 groups of 3", not "5 x 3").
- Keep numbers small and concrete where the lesson allows.""",
    "intellectual": """This student has an intellectual disability.
- Stem under 10 words. Only the most common everyday words.
- Options under 5 words each.
- Test one concrete fact directly stated in the lesson.""",
    "anxiety": """This student finds tests stressful.
- Neutral, encouraging phrasing. No trick questions, no negative framing.
- Never use "NOT", "EXCEPT" or double negatives.
- Keep the stem short and unambiguous.""",
}

SCHEMA_HINT = """Return ONLY a JSON array. Each element must be exactly:
{
  "question": "string",
  "options": ["string", "string", "string", "string"],
  "answer": "string (must be character-for-character one of the options)",
  "topic": "string",
  "conceptId": "snake_case_string",
  "difficulty": 1,
  "explanation": "one sentence saying why the answer is right",
  "simplerQuestion": "string",
  "simplerOptions": ["string", "string", "string", "string"],
  "simplerAnswer": "string (must be one of simplerOptions)"
}"""


def _valid(item: dict) -> bool:
    """Reject malformed items rather than serving a broken question.

    The most damaging failure is an `answer` that is not among `options`: the
    student cannot possibly get it right, and DASE would record a knowledge gap
    that is really a generation bug.
    """
    try:
        options = item["options"]
        if not isinstance(options, list) or len(options) != N_OPTIONS:
            return False
        if len({str(o).strip().lower() for o in options}) != N_OPTIONS:
            return False  # duplicate options
        if str(item["answer"]).strip() not in [str(o).strip() for o in options]:
            return False
        if not str(item.get("question", "")).strip():
            return False

        simpler = item.get("simplerOptions")
        if isinstance(simpler, list) and simpler:
            if str(item.get("simplerAnswer", "")).strip() not in [str(o).strip() for o in simpler]:
                return False
        return True
    except (KeyError, TypeError):
        return False


def _normalise(item: dict, index: int) -> dict:
    options = [str(o).strip() for o in item["options"]]
    answer = str(item["answer"]).strip()

    # Shuffle so the correct answer isn't positionally predictable — models very
    # often put it first, which a student learns to exploit within one quiz.
    random.shuffle(options)

    simpler_options = [str(o).strip() for o in item.get("simplerOptions") or []]
    if simpler_options:
        random.shuffle(simpler_options)

    difficulty = item.get("difficulty", 3)
    try:
        difficulty = max(1, min(5, int(difficulty)))
    except (TypeError, ValueError):
        difficulty = 3

    return {
        "questionId": f"q{index}",
        "question": str(item["question"]).strip(),
        "options": options,
        "answer": answer,
        "topic": str(item.get("topic") or "").strip() or None,
        "conceptId": str(item.get("conceptId") or "").strip() or None,
        "difficulty": difficulty,
        "questionType": "mcq",
        "explanation": str(item.get("explanation") or "").strip() or None,
        "simplerQuestion": str(item.get("simplerQuestion") or "").strip() or None,
        "simplerOptions": simpler_options or None,
        "simplerAnswer": str(item.get("simplerAnswer") or "").strip() or None,
    }


# ─────────────── fallback ───────────────

_WORD = re.compile(r"[A-Za-z][A-Za-z'-]*")


def _fallback_quiz(text: str, count: int) -> List[dict]:
    """spaCy fill-in-the-blank, used only when Gemini is unreachable.

    Kept because a poor quiz beats a broken page, but it is explicitly marked
    `degraded` so its results can be excluded from any DASE analysis.
    """
    import spacy

    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        return []

    doc = nlp(text)
    pool = [t.text for t in doc if t.pos_ in ("NOUN", "VERB", "ADJ")]
    items: List[dict] = []

    for sent in doc.sents:
        if len(items) >= count:
            break
        if len(sent.text.split()) <= 5:
            continue
        blanks = [t.text for t in sent if t.pos_ in ("NOUN", "VERB", "ADJ")]
        if not blanks:
            continue

        answer = random.choice(blanks)
        distractors = [w for w in dict.fromkeys(pool) if w.lower() != answer.lower()]
        random.shuffle(distractors)
        options = [answer] + distractors[: N_OPTIONS - 1]
        if len(options) < N_OPTIONS:
            continue
        random.shuffle(options)

        items.append(
            {
                "questionId": f"q{len(items)}",
                "question": sent.text.replace(answer, "______"),
                "options": options,
                "answer": answer,
                "topic": None,
                "conceptId": None,
                "difficulty": 3,
                "questionType": "mcq",
                "explanation": None,
                "simplerQuestion": None,
                "simplerOptions": None,
                "simplerAnswer": None,
            }
        )
    return items


# ─────────────── entry point ───────────────


def generate_quiz(text: str, profile: str = "default", count: int = 10) -> dict:
    text = (text or "").strip()
    if not text:
        return {"questions": [], "profile": profile, "degraded": False}

    if profile not in FORMATS:
        profile = "default"

    def compute() -> List[dict]:
        system = f"{BASE_RULES}\nSTUDENT PROFILE:\n{FORMATS[profile]}\n\n{SCHEMA_HINT}"
        raw = call_json(
            system,
            f"Write {count} multiple-choice questions from this lesson:\n\n{text[:8000]}",
        )
        if not isinstance(raw, list):
            raw = raw.get("questions", []) if isinstance(raw, dict) else []
        return [_normalise(it, i) for i, it in enumerate(q for q in raw if _valid(q))]

    try:
        questions = get_or_compute("quiz_cache", make_key(text, profile, str(count)), compute)
        degraded = False
    except LLMUnavailable as exc:
        print(f"[quiz_gen] LLM unavailable, falling back to spaCy: {exc}")
        questions, degraded = _fallback_quiz(text, count), True

    if not questions:
        questions, degraded = _fallback_quiz(text, count), True

    return {"questions": questions[:count], "profile": profile, "degraded": degraded}
