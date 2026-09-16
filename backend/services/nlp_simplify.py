"""Text simplification on TWO independent axes: grade level and disability profile.

These branches each built one axis and not the other:
  - `main` built grade-level personalization (1st-8th grade, explicit max-words-
    per-sentence per grade) + a reading-difficulty hint (easy/medium/hard).
  - `master` built disability-profile personalization (9 profiles: dyslexia,
    deaf, autism, adhd, blind, dyscalculia, intellectual, anxiety, default),
    each encoding a specific documented barrier, not a generic "simpler" ask.

A dyslexic 5th-grader needs both — grade level sets the vocabulary ceiling,
disability profile sets the STRUCTURE (sentence length, figurative language,
pronoun use, etc). They compose into one system prompt rather than one
overriding the other.
"""

from typing import Dict, List, Optional

from services import readability
from services.cache import get_or_compute, make_key
from services.llm import LLMUnavailable, call_text

# Every profile inherits this. Non-negotiable: a simplifier that drops content
# creates construct-irrelevant variance — the student is assessed on material
# they were never shown (disability_research_compilation.md §3).
BASE_RULES = """You rewrite educational text so a specific student can understand it.

ABSOLUTE RULES — these override every style instruction below:
1. Keep EVERY fact, name, number, date and technical term from the original.
2. Never add information, opinions, examples or commentary that is not in the original.
3. If a technical term must be kept, keep it AND explain it in plain words the first time.
4. Preserve the original order of ideas.
5. Output ONLY the rewritten text. No preamble, no notes, no markdown headings.
"""

PROFILES: Dict[str, str] = {
    "default": """Rewrite in plain language.
- Short sentences, one idea each. Active voice.
- Replace uncommon words with everyday words.""",
    "dyslexia": """Rewrite for a student with dyslexia.
- Maximum 12 words per sentence. One idea per sentence.
- Active voice only. Subject first, then verb, then object.
- NO nested or subordinate clauses. Split them into separate sentences.
- Prefer short, common, phonically regular words.
- Repeat the key noun instead of using pronouns like "it" or "they".
- Put a blank line between each group of 2-3 sentences.""",
    "deaf": """Rewrite for a Deaf student whose first language may be a sign
language, not English.
- Maximum 10 words per sentence. One idea per sentence.
- Use ONLY common, concrete words. No idioms, metaphors, similes or figures of speech.
  ("The heart pumps blood" — never "the heart is the body's engine".)
- Always subject-verb-object. No passive voice. No "there is/there are" openings.
- Avoid English-specific constructions: phrasal verbs ("put up with"), tense-stacking.
- Add ONE relevant emoji after a key concrete noun to anchor it visually. Do not overuse.
- Number any sequence of steps.""",
    "autism": """Rewrite for an autistic student.
- Be completely literal. No metaphors, idioms, sarcasm, irony, humour or rhetorical questions.
- Use EXACTLY THE SAME WORD for the same concept every time. Never vary vocabulary for
  style — if it is called a "cell" once, it is a "cell" every time.
- No ambiguous pronouns. Repeat the noun.
- Make structure explicit: state what is coming, then give it. Number sequences.
- Avoid vague quantifiers ("some", "a few", "often"). Give the actual amount when known.""",
    "adhd": """Rewrite for a student with ADHD.
- Put the single most important point in the FIRST sentence.
- Break the text into short chunks of 2-3 sentences, separated by blank lines.
- Maximum 15 words per sentence.
- Number every list and every sequence of steps.
- Cut all filler, throat-clearing and restatement.""",
    "blind": """Rewrite for a blind student who will hear this read aloud by a screen reader.
- Remove ALL visual and spatial references: "as shown above", "the figure on the left".
  Replace them with the actual information.
- Spell out every symbol and abbreviation in words: "%" becomes "percent", "e.g." becomes
  "for example".
- Keep sentences under 20 words so they are easy to follow by ear.
- Announce structure in words: "There are three causes. First... Second... Third..."
- Do not use tables, bullet symbols or ASCII layout.""",
    "dyscalculia": """Rewrite for a student with dyscalculia.
- Describe every quantity in concrete, countable terms ("3 apples", not "a set of cardinality 3").
- ONE mathematical operation per sentence.
- Write numbers as digits, and say what each number counts ("12 students", never a bare "12").
- Replace abstract notation with words: "5 x 3" becomes "5 groups of 3".""",
    "intellectual": """Rewrite as Easy Read for a student with an intellectual disability.
- Maximum 8 words per sentence. Exactly one idea per sentence.
- Use only the most common everyday words.
- Repeat the key word instead of using pronouns.
- Say the main point first, then again in different simple words at the end.
- Number every step.""",
    "anxiety": """Rewrite for a student who finds studying stressful.
- Calm, warm, matter-of-fact tone. Never urgent.
- Break into small numbered steps.
- Remove pressure language: "quickly", "you must", "obviously", "simply", "just", "easy".
- Never imply something is obvious or that the reader should already know it.""",
}

# main's per-grade word-limit table. Independent axis from PROFILES above —
# grade sets vocabulary/length CEILING, profile sets STRUCTURE.
_GRADE_PROFILES: Dict[str, Dict[str, object]] = {
    "1": {"max_words": 8, "grade_desc": "1st-grade (age 6-7)"},
    "2": {"max_words": 8, "grade_desc": "2nd-grade (age 7-8)"},
    "3": {"max_words": 10, "grade_desc": "3rd-grade (age 8-9)"},
    "4": {"max_words": 10, "grade_desc": "4th-grade (age 9-10)"},
    "5": {"max_words": 12, "grade_desc": "5th-grade (age 10-11)"},
    "6": {"max_words": 12, "grade_desc": "6th-grade (age 11-12)"},
    "7": {"max_words": 15, "grade_desc": "7th-grade (age 12-13)"},
    "8": {"max_words": 15, "grade_desc": "8th-grade (age 13-14)"},
}

_DIFFICULTY_HINTS: Dict[str, str] = {
    "easy": "Use the simplest possible words. Prefer one-syllable words whenever you can.",
    "medium": "Use simple words but you may include common two-syllable words.",
    "hard": "You may use grade-appropriate academic vocabulary if there is no simpler alternative.",
}

# Sentence-length ceiling PER PROFILE, for the faithfulness check below. When a
# grade_level is also given, the tighter (smaller) of the two limits applies —
# a 1st-grader with dyslexia gets the 1st-grade limit, not the looser dyslexia
# default, since grade level is the harder constraint for young readers.
PROFILE_MAX_SENTENCE: Dict[str, float] = {
    "intellectual": 9.0,
    "deaf": 11.0,
    "dyslexia": 13.0,
    "dyscalculia": 14.0,
    "adhd": 16.0,
    "autism": 16.0,
    "anxiety": 16.0,
    "blind": 21.0,
    "default": 20.0,
}

MAX_CHARS = 6000


def available_profiles() -> List[str]:
    return sorted(PROFILES)


def _chunk(text: str, size: int = MAX_CHARS) -> List[str]:
    if len(text) <= size:
        return [text]
    chunks, current = [], ""
    for para in text.split("\n"):
        if len(current) + len(para) + 1 > size and current:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n{para}" if current else para
    if current:
        chunks.append(current)
    return chunks


def _build_system_prompt(profile: str, grade_level: Optional[str], reading_difficulty: Optional[str]) -> str:
    parts = [BASE_RULES, "\nSTUDENT PROFILE INSTRUCTIONS:\n" + PROFILES[profile]]

    if grade_level:
        grade = _GRADE_PROFILES.get(str(grade_level), _GRADE_PROFILES["4"])
        parts.append(
            f"\nGRADE-LEVEL VOCABULARY CEILING: this student reads at a "
            f"{grade['grade_desc']} level. Use only vocabulary a student at that "
            f"level already knows. Sentences must be at most {grade['max_words']} "
            f"words — if the profile instructions above allow more, {grade['max_words']} "
            f"still wins, since a younger reader is the harder constraint."
        )
    if reading_difficulty:
        hint = _DIFFICULTY_HINTS.get(reading_difficulty, _DIFFICULTY_HINTS["medium"])
        parts.append(f"\nAdditional vocabulary guidance: {hint}")

    return "\n".join(parts)


def _max_sentence_for(profile: str, grade_level: Optional[str]) -> float:
    limit = PROFILE_MAX_SENTENCE.get(profile, 20.0)
    if grade_level:
        grade_limit = float(_GRADE_PROFILES.get(str(grade_level), {}).get("max_words", limit))
        limit = min(limit, grade_limit)
    return limit


def _fallback(text: str) -> str:
    """LLM unreachable: return the ORIGINAL text, never a broken rewrite."""
    return text


def simplify_text(
    text: str,
    profile: str = "default",
    grade_level: Optional[str] = None,
    reading_difficulty: Optional[str] = None,
) -> dict:
    text = (text or "").strip()
    if not text:
        empty = readability.analyze("")
        return {
            "simplified": "", "profile": profile, "before": empty, "after": empty,
            "degraded": False, "metTarget": True,
        }

    if profile not in PROFILES:
        profile = "default"

    def compute() -> str:
        system = _build_system_prompt(profile, grade_level, reading_difficulty)
        return "\n\n".join(
            call_text(system, f"Rewrite this text:\n\n{part}") for part in _chunk(text)
        )

    key = make_key(text, profile, str(grade_level or ""), str(reading_difficulty or ""))
    degraded = False
    try:
        simplified = get_or_compute("simplify_cache", key, compute)
    except LLMUnavailable as exc:
        print(f"[simplify] LLM unavailable, returning original: {exc}")
        simplified, degraded = _fallback(text), True

    before = readability.analyze(text)
    after = readability.analyze(simplified)
    max_sentence = _max_sentence_for(profile, grade_level)

    short_enough = after["avgSentenceLength"] <= max_sentence
    easier = after["gradeLevel"] <= before["gradeLevel"]

    return {
        "simplified": simplified,
        "profile": profile,
        "gradeLevel": grade_level,
        "readingDifficulty": reading_difficulty,
        "before": before,
        "after": after,
        "degraded": degraded,
        "metTarget": bool(short_enough and easier) if not degraded else False,
        "shortEnough": short_enough,
        "easier": easier,
        "maxSentenceTarget": max_sentence,
        "gradeDelta": round(before["gradeLevel"] - after["gradeLevel"], 1),
    }
