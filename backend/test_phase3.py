"""Phase 3 self-check — blind support. Run: python test_phase3.py

No network, no LLM. Intent matching is pure regex and the DASE voice parameters
are pure arithmetic, so all of this runs offline and free.
"""

import re
import sys
from pathlib import Path

from services import dase_engine as dase
from services import intent as I

FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "src"


def test_core_commands_match_without_llm():
    """Every core command must resolve on rules alone.

    If these needed the LLM, the voice layer would exhaust the 5-requests/minute
    free tier in under a minute of ordinary use, and every command would carry a
    round-trip of latency for a student who has no alternative input method.
    """
    expected = {
        "stop": I.STOP,
        "be quiet": I.STOP,
        "go to my quizzes": I.NAVIGATE,
        "take me to the dashboard": I.NAVIGATE,
        "open my lessons": I.NAVIGATE,
        "quiz": I.NAVIGATE,
        "read the next paragraph": I.READ_NEXT,
        "keep reading": I.READ_NEXT,
        "go back": I.READ_PREVIOUS,
        "read everything": I.READ_ALL,
        "repeat that": I.REPEAT,
        "what's on this page": I.DESCRIBE_PAGE,
        "where am i": I.DESCRIBE_PAGE,
        "explain this": I.EXPLAIN,
        "i don't understand": I.EXPLAIN,
        "what's my progress": I.PROGRESS,
        "how am i doing": I.PROGRESS,
        "help": I.HELP,
        "faster": I.FASTER,
        "slow down": I.SLOWER,
        "submit": I.SUBMIT,
    }
    misses = []
    for phrase, want in expected.items():
        got = I.classify(phrase, allow_llm=False)
        if got.name != want:
            misses.append(f"{phrase!r}: wanted {want}, got {got.name}")
    assert not misses, "rule misses:\n  " + "\n  ".join(misses)
    print(f"ok  core commands: {len(expected)}/{len(expected)} matched on rules alone")


def test_answer_selection_by_voice():
    """A blind student cannot click a radio button — voice IS the input path."""
    cases = {
        "answer a": 0, "answer B": 1, "choose C": 2, "select option D": 3,
        "choose the second one": 1, "option 3": 2, "pick the first": 0,
        "b": 1, "option two": 1, "4": 3,
    }
    for phrase, index in cases.items():
        got = I.classify(phrase, allow_llm=False)
        assert got.name == I.ANSWER, f"{phrase!r} -> {got.name}, wanted ANSWER"
        assert got.slots["optionIndex"] == index, (
            f"{phrase!r} -> option {got.slots['optionIndex']}, wanted {index}"
        )
    print(f"ok  answering by voice: {len(cases)} phrasings, all mapped correctly")


def test_stop_wins_over_everything():
    """'stop' must never be parsed as anything else — it is the escape hatch."""
    for phrase in ["stop", "stop reading", "stop the quiz", "please stop explaining"]:
        got = I.classify(phrase, allow_llm=False)
        assert got.name == I.STOP, f"{phrase!r} -> {got.name}; STOP must take priority"
    print("ok  STOP priority: never shadowed by read/explain/quiz keywords")


def test_unknown_is_unknown_not_a_guess():
    """Sending a blind student to the wrong page is worse than admitting confusion."""
    for phrase in ["the mitochondria is the powerhouse", "blorp zzz", ""]:
        got = I.classify(phrase, allow_llm=False)
        assert got.name == I.UNKNOWN, f"{phrase!r} -> {got.name}, should be UNKNOWN"
        assert got.slots == {}
    print("ok  unknown input: returns UNKNOWN, never a guessed destination")


def test_navigation_targets_are_real_routes():
    """A typo'd path would send a student into a blank page they cannot diagnose."""
    app_tsx = (FRONTEND / "App.tsx").read_text(encoding="utf-8")
    for target, path in I.ROUTES.items():
        assert path.startswith("/"), f"{target} path must be absolute"
        assert f'path="{path}"' in app_tsx, (
            f"route {path} ({target}) is not declared in App.tsx"
        )
    print(f"ok  routes: all {len(I.ROUTES)} voice destinations exist in App.tsx")


def test_frontend_and_backend_rules_have_not_drifted():
    """Guards the deliberate duplication between intent.py and voiceIntents.ts.

    The client copy exists for latency (a blind student should not wait on a
    network round-trip to be obeyed). The cost is two implementations, so this
    test fails if someone adds an intent to one side only.
    """
    ts = (FRONTEND / "services" / "voiceIntents.ts").read_text(encoding="utf-8")

    ts_intents = set(re.findall(r"\['([A-Z_]+)',\s*/", ts))
    ts_intents |= set(re.findall(r"intent:\s*'([A-Z_]+)'", ts))

    py_intents = {name for name, _ in I._RULES}
    py_intents |= {I.NAVIGATE, I.ANSWER}

    missing_in_ts = py_intents - ts_intents
    missing_in_py = ts_intents - py_intents - {"UNKNOWN"}

    assert not missing_in_ts, f"intents in intent.py but not voiceIntents.ts: {missing_in_ts}"
    assert not missing_in_py, f"intents in voiceIntents.ts but not intent.py: {missing_in_py}"

    # Routes must agree too, or a command works in one path and not the other.
    for target, path in I.ROUTES.items():
        assert f"{target}: '{path}'" in ts, f"route {target} -> {path} missing from voiceIntents.ts"
    print(f"ok  no drift: {len(py_intents)} intents and {len(I.ROUTES)} routes match across both files")


def test_voice_parameters_feed_dase():
    """VOICE_Q and NAV_EFF are declared in the blind profile and were unmeasurable
    until Phase 3. They must now appear."""
    good = [
        {"understood": True, "sttConfidence": 0.95, "actionMs": 1500, "repeats": 0},
        {"understood": True, "sttConfidence": 0.90, "actionMs": 2000, "repeats": 0},
        {"understood": True, "sttConfidence": 0.92, "actionMs": 1800, "repeats": 0},
    ]
    poor = [
        {"understood": False, "sttConfidence": 0.40, "actionMs": None, "repeats": 2},
        {"understood": True, "sttConfidence": 0.55, "actionMs": 9000, "repeats": 1},
        {"understood": False, "sttConfidence": 0.35, "actionMs": None, "repeats": 3},
    ]

    good_params = dase.compute_parameters([], voice_events=good)
    poor_params = dase.compute_parameters([], voice_events=poor)

    assert "VOICE_Q" in good_params and "NAV_EFF" in good_params
    assert good_params["VOICE_Q"] > poor_params["VOICE_Q"]
    assert good_params["NAV_EFF"] > poor_params["NAV_EFF"]
    assert all(0.0 <= v <= 1.0 for v in {**good_params, **poor_params}.values())

    # Too few samples must yield nothing rather than a number built on 1 utterance.
    assert dase.compute_parameters([], voice_events=good[:1]) == {}
    print(
        f"ok  voice params: good VOICE_Q={good_params['VOICE_Q']:.2f} "
        f"NAV_EFF={good_params['NAV_EFF']:.2f} vs poor {poor_params['VOICE_Q']:.2f}/"
        f"{poor_params['NAV_EFF']:.2f}"
    )


def test_blind_profile_now_scores_voice_parameters():
    """The payoff: the blind profile declared VOICE_Q and NAV_EFF from Phase 2 and
    could not use them. They should now be scored, raising coverage."""
    without = dase.compute_dase({"ACC": 0.7, "COMP": 0.6, "EFFORT": 0.8}, "blind")
    with_voice = dase.compute_dase(
        {"ACC": 0.7, "COMP": 0.6, "EFFORT": 0.8, "VOICE_Q": 0.85, "NAV_EFF": 0.75}, "blind"
    )
    assert "VOICE_Q" in with_voice["usedWeights"]
    assert "NAV_EFF" in with_voice["usedWeights"]
    assert with_voice["coverage"] > without["coverage"], "coverage must rise"
    assert "ATT_SPAN" not in with_voice["usedWeights"], (
        "webcam attention must never be scored for a blind student"
    )
    print(
        f"ok  blind profile: coverage {without['coverage']} -> {with_voice['coverage']}, "
        "ATT_SPAN still excluded"
    )


def test_decorative_images_are_dropped_but_failures_are_announced():
    """A blind student must never be silently unaware that content exists."""
    from unittest.mock import patch

    from services import image_describer
    from services.llm import LLMUnavailable

    fake_reader = type("R", (), {"pages": []})()

    with patch.object(image_describer, "extract_images", return_value=[
        {"page": 1, "name": "logo", "data": b"x"},
        {"page": 2, "name": "chart", "data": b"y"},
    ]):
        with patch.object(image_describer, "describe_image", side_effect=["DECORATIVE", "A chart showing growth."]):
            out = image_describer.describe_pdf_images(fake_reader)
        assert len(out) == 1 and out[0]["page"] == 2, "decorative images must be dropped"

        with patch.object(image_describer, "describe_image", side_effect=LLMUnavailable("quota")):
            failed = image_describer.describe_pdf_images(fake_reader)
        assert len(failed) == 2, "a failed description must still be reported"
        assert all(f["degraded"] for f in failed)
        assert "could not be described" in failed[0]["description"]
    print("ok  image descriptions: decorative dropped, failures announced not hidden")


def test_help_text_covers_the_commands_it_claims():
    """The spoken help is a blind student's only discovery mechanism."""
    help_lower = I.HELP_TEXT.lower()
    for phrase in ["quiz", "lesson", "read next", "explain", "answer", "submit", "stop", "faster"]:
        assert phrase in help_lower, f"help text never mentions {phrase!r}"
    assert len(I.HELP_TEXT) < 700, "help must be listenable, not a monologue"
    print("ok  help text: mentions every core command, stays short enough to hear")


if __name__ == "__main__":
    tests = [
        test_core_commands_match_without_llm,
        test_answer_selection_by_voice,
        test_stop_wins_over_everything,
        test_unknown_is_unknown_not_a_guess,
        test_navigation_targets_are_real_routes,
        test_frontend_and_backend_rules_have_not_drifted,
        test_voice_parameters_feed_dase,
        test_blind_profile_now_scores_voice_parameters,
        test_decorative_images_are_dropped_but_failures_are_announced,
        test_help_text_covers_the_commands_it_claims,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 3 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
