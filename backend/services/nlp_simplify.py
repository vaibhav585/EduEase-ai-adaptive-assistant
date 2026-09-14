"""Disability-profiled text simplification.

Replaces the Phase 0 implementation, which substituted spaCy lemmas for words and
made text measurably *harder* to read ("The plants use sunlight" -> "the plant use
sunlight"). Each profile below encodes a specific, documented barrier rather than a
generic "make it simpler" instruction — see disability_research_compilation.md.
"""

from typing import Dict, List

from services import readability
from services.cache import get_or_compute, make_key
from services.llm import LLMUnavailable, call_text

# Every profile inherits this. The non-negotiable part is fidelity: a simplifier
# that quietly drops content creates construct-irrelevant variance — the student is
# then assessed on material they were never shown (research doc §3).
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
- Replace uncommon words with everyday words.
- Aim for a reading age of about 12.""",
    # Decoding is effortful, so every extra word costs. Nested clauses force
    # re-reading, which is where dyslexic readers lose the thread.
    "dyslexia": """Rewrite for a student with dyslexia.
- Maximum 12 words per sentence. One idea per sentence.
- Active voice only. Subject first, then verb, then object.
- NO nested or subordinate clauses. Split them into separate sentences.
- Prefer short, common, phonically regular words.
- Repeat the key noun instead of using pronouns like "it" or "they".
- Put a blank line between each group of 2-3 sentences.""",
    # Many deaf adults read at or below 4th-grade level, and ASL/ISL grammar differs
    # structurally from English. Figurative language is a documented, severe barrier.
    "deaf": """Rewrite for a Deaf student who reads at about a 4th-grade level and whose
first language may be a sign language, not English.
- Maximum 10 words per sentence. One idea per sentence.
- Use ONLY common, concrete words. No idioms, metaphors, similes or figures of speech.
  ("The heart pumps blood" — never "the heart is the body's engine".)
- Always subject-verb-object. No passive voice. No "there is/there are" openings.
- Avoid English-specific constructions: phrasal verbs ("put up with"), articles-heavy
  phrasing, and tense-stacking ("would have been going").
- Prefer words that name things you can see or picture.
- Add ONE relevant emoji after a key concrete noun to anchor it visually. Do not overuse.
- Number any sequence of steps.""",
    # Literal interpretation, and — the part usually missed — synonym variation reads
    # as a change of subject. Consistent terminology matters more than elegant prose.
    "autism": """Rewrite for an autistic student.
- Be completely literal. No metaphors, idioms, sarcasm, irony, humour or rhetorical questions.
- Use EXACTLY THE SAME WORD for the same concept every time. Never vary vocabulary for
  style — if it is called a "cell" once, it is a "cell" every time, never "unit" or "it".
- No ambiguous pronouns. Repeat the noun.
- Make structure explicit: state what is coming, then give it.
- Number every sequence and step.
- Avoid vague quantifiers ("some", "a few", "often"). Give the actual amount when it is known.""",
    # Working memory and sustained attention. Front-load, chunk, and signpost so a
    # lapse costs one chunk rather than the whole passage.
    "adhd": """Rewrite for a student with ADHD.
- Put the single most important point in the FIRST sentence.
- Break the text into short chunks of 2-3 sentences, separated by blank lines.
- Maximum 15 words per sentence.
- Put **bold** around the key term in each chunk.
- Number every list and every sequence of steps.
- Cut all filler, throat-clearing and restatement.""",
    # Audio-first. Spatial deixis is meaningless through a screen reader, and unspoken
    # symbols are simply lost.
    "blind": """Rewrite for a blind student who will hear this read aloud by a screen reader.
- Remove ALL visual and spatial references: "as shown above", "the figure on the left",
  "see the diagram below", "the highlighted row". Replace them with the actual information.
- Spell out every symbol and abbreviation in words: "%" becomes "percent", "->" becomes
  "leads to", "H2O" becomes "H two O", "e.g." becomes "for example".
- Describe any relationship verbally instead of pointing at it spatially.
- Keep sentences under 20 words so they are easy to follow by ear.
- Announce structure in words: "There are three causes. First... Second... Third..."
- Do not use tables, bullet symbols or ASCII layout. Use spoken sequencing words.""",
    # Number sense, not arithmetic skill. Abstract notation and multi-step sentences
    # are where it breaks down.
    "dyscalculia": """Rewrite for a student with dyscalculia.
- Describe every quantity in concrete, countable terms ("3 apples", not "a set of cardinality 3").
- ONE mathematical operation per sentence. Never combine steps.
- Write numbers as digits, and say what each number counts ("12 students", never a bare "12").
- Replace abstract notation with words: "5 x 3" becomes "5 groups of 3".
- When a comparison appears, say which is bigger in plain words.
- Give every step a number, in order.""",
    # High repetition, concrete concepts, minimal abstraction.
    "intellectual": """Rewrite as Easy Read for a student with an intellectual disability.
- Maximum 8 words per sentence. Exactly one idea per sentence.
- Use only the most common everyday words.
- Repeat the key word in each sentence instead of using pronouns.
- Say the main point first. Then say it again in different simple words at the end.
- Number every step.
- No abstract or general statements — give the concrete, specific case.""",
    # Time and evaluation pressure reduce working memory. Framing matters.
    "anxiety": """Rewrite for a student who finds studying stressful.
- Calm, warm, matter-of-fact tone. Never urgent.
- Break into small numbered steps so it looks manageable.
- Remove all pressure language: "quickly", "you must", "obviously", "simply", "just",
  "everyone knows", "easy".
- Never imply something is obvious or that the reader should already know it.
- Maximum 15 words per sentence.""",
}

# Max average sentence length per profile, mirroring the word limits each prompt
# above actually instructs. This is a FAITHFULNESS check: did the model do what
# the profile asked?
#
# We deliberately do NOT target an absolute Flesch Reading Ease. Reading ease is
# dominated by syllables-per-word, and BASE_RULES rule 1 requires keeping domain
# terms ("photosynthesis", "chlorophyll"), which caps the achievable score on any
# technical text. Measured: a well-simplified deaf-profile passage scored 51.6 ease
# against a nominal 4th-grade target of 85 — the rewrite was good, the target was
# unreachable. A check that always fails gets ignored, so we measure the levers the
# prompt controls (sentence length) and require the grade level to actually drop.
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

MAX_CHARS = 6000  # chunk above this; Gemini quality degrades on very long inputs


def available_profiles() -> List[str]:
    return sorted(PROFILES)


def _chunk(text: str, size: int = MAX_CHARS) -> List[str]:
    """Split on paragraph boundaries so a chunk never cuts a sentence in half."""
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


def _fallback(text: str) -> str:
    """Used when Gemini is unreachable. Returns the ORIGINAL text unchanged.

    Deliberately not the old lemma substitution: unsimplified real text is far
    better for a student than grammatically broken text.
    """
    return text


def simplify_text(text: str, profile: str = "default") -> dict:
    """Simplify `text` for `profile`. Cached on (text, profile).

    Always returns usable content — on LLM failure it returns the original text with
    `degraded: True` so the caller can tell the student why it looks unchanged.
    """
    text = (text or "").strip()
    if not text:
        return {
            "simplified": "",
            "profile": profile,
            "before": readability.analyze(""),
            "after": readability.analyze(""),
            "degraded": False,
            "metTarget": True,
        }

    if profile not in PROFILES:
        profile = "default"

    def compute() -> str:
        system = f"{BASE_RULES}\n\nSTUDENT PROFILE INSTRUCTIONS:\n{PROFILES[profile]}"
        return "\n\n".join(
            call_text(system, f"Rewrite this text:\n\n{part}") for part in _chunk(text)
        )

    degraded = False
    try:
        simplified = get_or_compute("simplify_cache", make_key(text, profile), compute)
    except LLMUnavailable as exc:
        print(f"[simplify] LLM unavailable, returning original: {exc}")
        simplified, degraded = _fallback(text), True

    before = readability.analyze(text)
    after = readability.analyze(simplified)
    max_sentence = PROFILE_MAX_SENTENCE.get(profile, 20.0)

    # Two independent conditions, both required:
    #   1. sentences are as short as the profile asked for (prompt faithfulness)
    #   2. the text genuinely got easier (no regression)
    # Reported separately so a failure says WHICH one failed.
    short_enough = after["avgSentenceLength"] <= max_sentence
    easier = after["gradeLevel"] <= before["gradeLevel"]

    return {
        "simplified": simplified,
        "profile": profile,
        "before": before,
        "after": after,
        "degraded": degraded,
        # Surfaced so a profile that consistently underperforms is visible rather
        # than silently bad — these feed the paper's readability table (roadmap §4b).
        "metTarget": bool(short_enough and easier) if not degraded else False,
        "shortEnough": short_enough,
        "easier": easier,
        "maxSentenceTarget": max_sentence,
        "gradeDelta": round(before["gradeLevel"] - after["gradeLevel"], 1),
    }
