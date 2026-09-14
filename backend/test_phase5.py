"""Phase 5.3 self-check — accessible notifications (deaf/hard-of-hearing support).
Run: python test_phase5.py

This repo has no frontend test runner (see test_phase4.py's note on the same
constraint), so these are static source checks: they fail if the wiring that
makes VoiceNavigator's audio-only cues reach a deaf student is ever quietly
removed, even though nothing would throw an error if it were — the bug this
guards against is silence, not an exception.
"""

import re
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "src"


def _read(*parts: str) -> str:
    return (FRONTEND / Path(*parts)).read_text(encoding="utf-8")


def test_no_blocking_alerts_remain():
    """alert() is invisible-to-none but also unstyleable, blocking, and gives a
    deaf student the exact same disruptive native dialog as everyone else."""
    offenders = []
    for path in FRONTEND.rglob("*.tsx"):
        for line in path.read_text(encoding="utf-8").splitlines():
            code = line.split("//", 1)[0]  # drop trailing comments; explanatory
            # comments mentioning "Was alert()" must not trip this check.
            if re.search(r"(?<![A-Za-z0-9_.])alert\(", code):
                offenders.append(str(path.relative_to(FRONTEND)))
                break
    assert not offenders, f"alert() still used in: {offenders}"
    print("ok  no alert() calls remain anywhere in src/")


def test_accessible_notification_mounted():
    app = _read("App.tsx")
    assert "AccessibleNotification" in app, "AccessibleNotification not imported in App.tsx"
    assert "<AccessibleNotification" in app, "AccessibleNotification never rendered"
    print("ok  AccessibleNotification is mounted in App.tsx")


def test_notify_service_shape():
    notify_ts = _read("services", "notify.ts")
    assert "export function notify(" in notify_ts
    assert "silent" in notify_ts, "silent flag missing — announce() needs it to avoid double-speaking"
    assert "navigator.vibrate" in notify_ts, "Vibration API path missing (roadmap 5.3)"
    print("ok  notify.ts: notify(), silent flag, and vibration all present")


def test_announce_combines_speech_and_caption():
    speech_ts = _read("services", "speech.ts")
    assert "export function announce(" in speech_ts
    assert "notify(" in speech_ts.split("export function announce(")[1].split("\n\n")[0], (
        "announce() must call notify() — that's the whole point of it"
    )
    print("ok  speech.ts: announce() calls both speak() and notify()")


def test_voice_navigator_captions_every_playcue():
    """Every playCue() (audio-only) call site must have a paired notify() or
    announce() somewhere nearby — the visual/vibration twin for a deaf student.

    Not a line-by-line pairing (too brittle), but the counts must be close: a
    playCue with NO nearby caption at all is exactly the bug this phase fixes.
    """
    nav = _read("components", "VoiceNavigator.tsx")

    play_cue_calls = len(re.findall(r"playCue\(", nav))
    caption_calls = len(re.findall(r"\bannounce\(", nav)) + len(re.findall(r"\bnotify\(", nav))

    assert play_cue_calls >= 6, f"expected the known 6 playCue() sites, found {play_cue_calls}"
    assert caption_calls >= play_cue_calls, (
        f"{play_cue_calls} audio cues but only {caption_calls} caption/notify calls — "
        "some state changes are audio-only and invisible to a deaf student"
    )

    # The two cues with no accompanying spoken text (listening, thinking) must
    # have their OWN direct notify() — announce() alone won't cover them since
    # there's nothing to speak yet.
    assert "kind: 'listening'" in nav, "no visual cue for the listening state"
    assert "kind: 'thinking'" in nav, "no visual cue for the thinking state"
    print(f"ok  VoiceNavigator: {play_cue_calls} playCue() sites, {caption_calls} caption calls")


def test_say_uses_announce_not_raw_speak():
    """say() is VoiceNavigator's single spoken-response path (STOP excepted) —
    if it silently reverted to speak(), every voice response would stop being
    captioned in one line, invisibly."""
    nav = _read("components", "VoiceNavigator.tsx")
    say_fn = nav.split("const say = useCallback(")[1].split("[rate],")[0]
    assert "announce(" in say_fn, "say() no longer routes through announce()"
    assert "speak(" not in say_fn or "announce(" in say_fn.split("speak(")[0], (
        "say() calls speak() directly instead of announce() — captions lost"
    )
    print("ok  VoiceNavigator's say() routes through announce(), not raw speak()")


def test_quiz_and_learning_voice_handlers_are_captioned():
    """The page-local voice command handlers (answer selection, read-next, etc.)
    bypass VoiceNavigator's say() entirely — they must use announce(), not the
    bare speak(), or a deaf student navigating a quiz by voice gets nothing
    when their answer is confirmed."""
    for page in ("QuizPage.tsx", "LearningPage.tsx"):
        src = _read("pages", page)
        assert "from '../services/speech'" in src
        speech_import = [ln for ln in src.split("\n") if "from '../services/speech'" in ln][0]
        assert "announce" in speech_import, f"{page} doesn't import announce()"
        # A bare, unqualified speak( (not "speechSynthesis.speak(") would mean a
        # leftover uncaptioned call site.
        bare_speak = re.search(r"(?<![A-Za-z0-9_.])speak\(", src)
        assert not bare_speak, f"{page} still has a raw speak( call — should be announce("
    print("ok  QuizPage and LearningPage voice handlers use announce(), not raw speak()")


if __name__ == "__main__":
    tests = [
        test_no_blocking_alerts_remain,
        test_accessible_notification_mounted,
        test_notify_service_shape,
        test_announce_combines_speech_and_caption,
        test_voice_navigator_captions_every_playcue,
        test_say_uses_announce_not_raw_speak,
        test_quiz_and_learning_voice_handlers_are_captioned,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 5.3 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
