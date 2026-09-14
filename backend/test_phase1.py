"""Phase 1 self-check. Run: python test_phase1.py

Covers the content pipeline's logic WITHOUT calling Gemini — the LLM is stubbed so
this runs offline, deterministically, and for free. Live model quality is checked
separately (see PHASE_LEARNINGS.md §1.5).
"""

import sys
from unittest.mock import patch


def test_readability_ranks_texts():
    from services import readability

    hard = (
        "The utilization of photosynthetic mechanisms enables autotrophic organisms to "
        "synthesize carbohydrates, thereby facilitating energy conversion."
    )
    easy = "Plants use sunlight to make food. This gives them energy."
    assert readability.analyze(hard)["gradeLevel"] > readability.analyze(easy)["gradeLevel"]
    assert readability.analyze("")["words"] == 0  # empty input must not divide by zero
    print("ok  readability: ranks hard > easy, handles empty")


def test_quiz_rejects_broken_items():
    """The worst failure mode: an `answer` not among `options`. The student cannot
    possibly get it right, and DASE would log a knowledge gap that is a generator bug."""
    from services.quiz_gen import _valid

    good = {
        "question": "What do plants make?",
        "options": ["Sugar", "Iron", "Plastic", "Stone"],
        "answer": "Sugar",
    }
    assert _valid(good)

    assert not _valid({**good, "answer": "Gold"}), "answer outside options must be rejected"
    assert not _valid({**good, "options": ["A", "B", "C"]}), "wrong option count must be rejected"
    assert not _valid({**good, "options": ["Sugar", "sugar", "Iron", "Stone"]}), (
        "duplicate options (case-insensitive) must be rejected"
    )
    assert not _valid({**good, "question": "  "}), "empty stem must be rejected"
    assert not _valid({}), "missing keys must not raise"

    # A simpler variant whose answer isn't in its own options would break the
    # Phase 2.4 closed loop at the exact moment a struggling student needs it.
    assert not _valid(
        {**good, "simplerOptions": ["X", "Y", "Z", "W"], "simplerAnswer": "Q"}
    ), "broken simpler variant must be rejected"
    print("ok  quiz validation: rejects unanswerable / duplicate / broken-variant items")


def test_quiz_normalises():
    from services.quiz_gen import _normalise

    item = _normalise(
        {
            "question": " What? ",
            "options": ["A", "B", "C", "D"],
            "answer": "B",
            "difficulty": 99,  # out of range
            "topic": "",
        },
        3,
    )
    assert item["questionId"] == "q3"
    assert item["difficulty"] == 5, "difficulty must clamp into 1..5"
    assert item["topic"] is None, "empty topic must normalise to None, not ''"
    assert item["answer"] in item["options"], "answer must survive the shuffle"

    bad_difficulty = _normalise({**item, "difficulty": "abc", "options": list("WXYZ"), "answer": "W"}, 0)
    assert bad_difficulty["difficulty"] == 3, "unparseable difficulty falls back to 3"
    print("ok  quiz normalisation: clamps difficulty, keeps answer in options")


def test_cache_computes_once():
    from services import cache

    cache.clear_memory()
    calls = []

    def compute():
        calls.append(1)
        return {"v": 42}

    key = cache.make_key("some text", "deaf")
    with patch.object(cache, "db", None):  # no Firestore -> memory layer only
        assert cache.get_or_compute("c", key, compute) == {"v": 42}
        assert cache.get_or_compute("c", key, compute) == {"v": 42}
    assert len(calls) == 1, "second call must hit the cache, not re-invoke Gemini"

    assert cache.make_key("t", "deaf") != cache.make_key("t", "blind"), (
        "profile must be part of the key or every student gets the first one's rewrite"
    )
    print("ok  cache: computes once, keyed on (text, profile)")


def test_simplify_degrades_to_original_not_garbage():
    """When Gemini is down we return the ORIGINAL text, never the old lemma output."""
    from services import nlp_simplify
    from services.llm import LLMUnavailable

    original = "The mitochondria produce energy for the cell."
    with patch.object(nlp_simplify, "get_or_compute", side_effect=LLMUnavailable("boom")):
        result = nlp_simplify.simplify_text(original, "deaf")

    assert result["degraded"] is True
    assert result["simplified"] == original, "fallback must be readable original text"
    assert result["metTarget"] is False, "a degraded result must never count as meeting target"
    print("ok  simplify: degrades to original text, flagged, never counted as success")


def test_all_profiles_are_distinct_and_complete():
    from services.nlp_simplify import PROFILE_MAX_SENTENCE, PROFILES
    from services.quiz_gen import FORMATS

    assert "default" in PROFILES and "default" in FORMATS
    # Every simplification profile needs a matching quiz format and sentence target,
    # or a student gets adapted text with unadapted questions.
    for name in PROFILES:
        assert name in FORMATS, f"profile '{name}' has no quiz format"
        assert name in PROFILE_MAX_SENTENCE, f"profile '{name}' has no sentence target"

    assert len({p.strip() for p in PROFILES.values()}) == len(PROFILES), (
        "two profiles share identical prompt text"
    )
    print(f"ok  profiles: {len(PROFILES)} complete and distinct across simplify + quiz")


def test_chunking_preserves_content():
    from services.nlp_simplify import _chunk

    text = "\n".join(f"Paragraph number {i} with some words in it." for i in range(400))
    chunks = _chunk(text, size=1000)
    assert len(chunks) > 1, "long text must be chunked"
    assert all(len(c) <= 1200 for c in chunks), "chunks must stay near the limit"
    rejoined = "\n".join(chunks)
    assert rejoined.count("Paragraph number") == 400, "chunking must not drop content"
    assert _chunk("short") == ["short"]
    print("ok  chunking: splits long text, drops nothing")


if __name__ == "__main__":
    tests = [
        test_readability_ranks_texts,
        test_quiz_rejects_broken_items,
        test_quiz_normalises,
        test_cache_computes_once,
        test_simplify_degrades_to_original_not_garbage,
        test_all_profiles_are_distinct_and_complete,
        test_chunking_preserves_content,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 1 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
