"""Voice command intent matching.

Rule-first by design. Three reasons:

  1. Speed — a blind student waiting 1.5s for an LLM round trip to hear "going to
     your quizzes" is a worse experience than a screen reader.
  2. Cost — the Gemini free tier is 5 requests/minute. A voice layer that called
     the LLM per utterance would exhaust the quota in under a minute of use.
  3. Reliability — the ~20 core commands are a closed set. Regex is exactly right
     for a closed set, and it cannot hallucinate a navigation target.

The LLM is the fallback for phrasings the rules miss, not the primary path.
"""

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

# ─────────────── intents ───────────────

NAVIGATE = "NAVIGATE"
READ_NEXT = "READ_NEXT"
READ_PREVIOUS = "READ_PREVIOUS"
READ_ALL = "READ_ALL"
REPEAT = "REPEAT"
STOP = "STOP"
DESCRIBE_PAGE = "DESCRIBE_PAGE"
EXPLAIN = "EXPLAIN"
PROGRESS = "PROGRESS"
HELP = "HELP"
FASTER = "FASTER"
SLOWER = "SLOWER"
ANSWER = "ANSWER"
SUBMIT = "SUBMIT"
UNKNOWN = "UNKNOWN"

ROUTES = {
    "dashboard": "/student-dashboard",
    "quiz": "/quiz",
    "learning": "/learning",
    "upload": "/upload",
    "content": "/content",
    "teacher": "/teacher-dashboard",
}

# Spoken option names -> zero-based index. A blind student cannot click, so
# answering by voice is not a convenience here, it is the only route in.
_OPTION_WORDS = {
    "a": 0, "first": 0, "one": 0, "1": 0,
    "b": 1, "second": 1, "two": 1, "2": 1,
    "c": 2, "third": 2, "three": 2, "3": 2,
    "d": 3, "fourth": 3, "four": 3, "4": 3,
}


@dataclass
class Intent:
    name: str
    slots: Dict[str, Any]
    confidence: float
    source: str  # "rules" | "llm" | "none"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent": self.name,
            "slots": self.slots,
            "confidence": round(self.confidence, 2),
            "source": self.source,
        }


# Order matters: the first pattern that matches wins, so put the urgent and the
# unambiguous first. STOP must come before everything — a student saying "stop"
# while the page is talking needs it honoured immediately, not parsed as a topic.
_RULES: List[tuple] = [
    (STOP, re.compile(r"\b(stop|quiet|silence|shut up|be quiet|pause|cancel|nevermind|never mind)\b")),

    (HELP, re.compile(r"\b(help|what can (i|you) (say|do)|commands|options available)\b")),

    (PROGRESS, re.compile(
        r"\b(my )?(progress|score|how (am i|i am) doing|how did i do|results?|marks)\b")),

    (DESCRIBE_PAGE, re.compile(
        r"\b(what('s| is) (on |in )?(this |the )?(page|screen)|where am i|describe( the)?"
        r"( page| screen)?|what can i do here)\b")),

    (EXPLAIN, re.compile(
        r"\b(explain|what does (this|that) mean|i don'?t understand|simpler|"
        r"say (that )?(again )?(in )?(simpler|easier)|break (it|this) down)\b")),

    (READ_NEXT, re.compile(
        r"\b(read (the )?next|next (paragraph|sentence|part|section|bit)|continue|"
        r"carry on|go on|keep reading)\b")),

    (READ_PREVIOUS, re.compile(
        r"\b(read (the )?(previous|last)|previous (paragraph|sentence|part|section)|"
        r"go back|back up)\b")),

    (REPEAT, re.compile(r"\b(repeat|say (that|it) again|again|once more|pardon|what)\b")),

    (READ_ALL, re.compile(
        r"\b(read (it |this |the )?(all|everything|whole|page|aloud)|start reading|read to me)\b")),

    (FASTER, re.compile(r"\b(faster|speed up|quicker|too slow)\b")),
    (SLOWER, re.compile(r"\b(slower|slow down|too fast)\b")),

    (SUBMIT, re.compile(r"\b(submit|confirm|next question|done|that'?s my answer|lock it in)\b")),
]

# "go to X" / "open X" / "take me to X"
_NAV_RE = re.compile(
    r"\b(go|navigate|take me|open|show me|switch)\b.*?\b"
    r"(dashboard|home|quiz|quizzes|test|lesson|lessons|learning|read|reading|"
    r"upload|content|material|materials|teacher)\b"
)
_NAV_TARGETS = {
    "dashboard": "dashboard", "home": "dashboard",
    "quiz": "quiz", "quizzes": "quiz", "test": "quiz",
    "lesson": "learning", "lessons": "learning", "learning": "learning",
    "read": "learning", "reading": "learning",
    "upload": "upload",
    "content": "content", "material": "content", "materials": "content",
    "teacher": "teacher",
}

# "answer B" / "choose the second one" / "select option 3"
_ANSWER_RE = re.compile(
    r"\b(answer|choose|select|pick|option|number)\b\s*"
    r"(?:is\s+|the\s+)?(?:option\s+|number\s+)?"
    r"\b([abcd]|first|second|third|fourth|one|two|three|four|[1-4])\b"
)
# bare "B" or "option two" with nothing else said
_BARE_OPTION_RE = re.compile(r"^\s*(?:option\s+)?([abcd]|[1-4]|first|second|third|fourth)\s*$")


def normalise(text: str) -> str:
    return re.sub(r"[^\w\s']", " ", (text or "").lower()).strip()


def match_rules(text: str) -> Optional[Intent]:
    """Try the rule set. Returns None when nothing matches, so the caller can
    decide whether the LLM fallback is worth a request."""
    cleaned = normalise(text)
    if not cleaned:
        return None

    # Answering a question takes priority over navigation: "take option two"
    # contains "take" but is clearly an answer.
    answer = _ANSWER_RE.search(cleaned) or _BARE_OPTION_RE.match(cleaned)
    if answer:
        word = answer.group(answer.lastindex or 1)
        if word in _OPTION_WORDS:
            return Intent(ANSWER, {"optionIndex": _OPTION_WORDS[word]}, 0.95, "rules")

    nav = _NAV_RE.search(cleaned)
    if nav:
        target = _NAV_TARGETS.get(nav.group(2))
        if target:
            return Intent(
                NAVIGATE, {"target": target, "path": ROUTES[target]}, 0.95, "rules"
            )

    for name, pattern in _RULES:
        if pattern.search(cleaned):
            return Intent(name, {}, 0.9, "rules")

    # Bare destination with no verb: "quiz", "dashboard"
    for word, target in _NAV_TARGETS.items():
        if cleaned == word:
            return Intent(NAVIGATE, {"target": target, "path": ROUTES[target]}, 0.8, "rules")

    return None


HELP_TEXT = (
    "You can say: go to my quizzes, go to my lessons, or go to my dashboard. "
    "While reading, say read next, read previous, repeat, or read everything. "
    "Say explain this if something is unclear, or what is on this page to hear a description. "
    "In a quiz, say answer A, answer B, answer C or answer D, then say submit. "
    "Say faster or slower to change the reading speed. "
    "Say stop at any time to make me quiet."
)

LLM_SYSTEM = f"""You classify a blind student's spoken command in a learning app.

Reply with ONLY a JSON object: {{"intent": "...", "slots": {{}}}}

Valid intents: {NAVIGATE}, {READ_NEXT}, {READ_PREVIOUS}, {READ_ALL}, {REPEAT}, {STOP},
{DESCRIBE_PAGE}, {EXPLAIN}, {PROGRESS}, {HELP}, {FASTER}, {SLOWER}, {ANSWER}, {SUBMIT}, {UNKNOWN}

For {NAVIGATE}, slots must be {{"target": one of dashboard|quiz|learning|upload|content|teacher}}.
For {ANSWER}, slots must be {{"optionIndex": 0|1|2|3}}.
All other intents take empty slots.

The input is speech-to-text output, so expect mis-recognition. If you cannot tell what
was meant, return {UNKNOWN} — do NOT guess a navigation target, because sending a blind
student to the wrong page is worse than admitting you did not understand.
"""


def classify(text: str, allow_llm: bool = True) -> Intent:
    """Rules first, LLM only if they miss and it is permitted."""
    hit = match_rules(text)
    if hit:
        return hit

    if not allow_llm:
        return Intent(UNKNOWN, {}, 0.0, "none")

    try:
        from services.llm import call_json

        raw = call_json(LLM_SYSTEM, f"Command: {text}")
        name = str(raw.get("intent", UNKNOWN)).upper()
        slots = raw.get("slots") or {}

        if name == NAVIGATE:
            target = slots.get("target")
            if target not in ROUTES:
                return Intent(UNKNOWN, {}, 0.0, "llm")
            slots = {"target": target, "path": ROUTES[target]}
        elif name == ANSWER:
            try:
                idx = int(slots.get("optionIndex", -1))
            except (TypeError, ValueError):
                return Intent(UNKNOWN, {}, 0.0, "llm")
            if not 0 <= idx <= 3:
                return Intent(UNKNOWN, {}, 0.0, "llm")
            slots = {"optionIndex": idx}
        else:
            slots = {}

        if name == UNKNOWN:
            return Intent(UNKNOWN, {}, 0.0, "llm")
        # LLM results are trusted less than a rule hit, and the gap is visible in
        # the VOICE_Q telemetry parameter.
        return Intent(name, slots, 0.6, "llm")
    except Exception as exc:  # noqa: BLE001
        print(f"[intent] LLM fallback unavailable: {exc}")
        return Intent(UNKNOWN, {}, 0.0, "none")
