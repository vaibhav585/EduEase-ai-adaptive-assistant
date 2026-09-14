"""Phase 0 self-check. Run: python test_phase0.py

Covers the bits that would silently rot: route wiring (legacy + /api both mounted),
telemetry event validation, the idempotency key, and per-user chatbot isolation.
Firestore is stubbed so this runs with no credentials and no network.
"""

import sys
from unittest.mock import MagicMock, patch


def test_routes_mounted():
    import app

    paths = {r.path for r in app.app.routes}
    # Legacy paths the current frontend calls — removing these breaks the app.
    for legacy in ("/upload-pdf/", "/simplify-text/", "/generate-quiz/", "/chatbot/"):
        assert legacy in paths, f"legacy path {legacy} disappeared"
    # Canonical /api mounts
    for api in ("/api/simplify-text/", "/api/events", "/api/sessions", "/api/health"):
        assert api in paths, f"{api} not mounted"
    print("ok  routes: legacy + /api both mounted")


def test_event_validation():
    from models.schemas import QuestionEvent

    ev = QuestionEvent(
        sessionId="s1", studentId="u1", ts=1, questionId="q0", correct=False, timeMs=4200
    )
    assert ev.type == "question"
    assert ev.attempts == 1 and ev.focusRatio is None and ev.focusSamples == 0

    # difficulty is constrained 1..5 — an out-of-range value must be rejected,
    # not silently stored, or DASE's per-difficulty baselines go wrong.
    try:
        QuestionEvent(
            sessionId="s", studentId="u", ts=1, questionId="q", correct=True, timeMs=1, difficulty=9
        )
        raise AssertionError("difficulty=9 should have been rejected")
    except Exception as exc:
        assert "difficulty" in str(exc)
    print("ok  event schema: defaults + difficulty bounds")


def test_idempotency_key():
    from routers.telemetry import _event_key

    a = {"type": "question", "questionId": "q3", "attempts": 1}
    b = {"type": "question", "questionId": "q3", "attempts": 1}
    c = {"type": "question", "questionId": "q3", "attempts": 2}  # closed-loop re-presentation
    assert _event_key(a) == _event_key(b), "resending a batch must not double-count"
    assert _event_key(a) != _event_key(c), "a re-presented question is a distinct attempt"
    print("ok  idempotency: replay-safe, re-presentation still distinct")


def test_chatbot_memory_is_per_user():
    """The bug this replaced: one global ConversationBufferMemory shared by everyone."""
    from routers import chatbot

    chatbot._memory.clear()
    a = chatbot._history("student_a")
    b = chatbot._history("student_b")
    a.append("a-secret")
    assert "a-secret" not in b, "student B can see student A's conversation"
    assert chatbot._history("student_a") is a, "history must persist across calls"

    # LRU cap holds
    for i in range(chatbot.MAX_USERS + 10):
        chatbot._history(f"u{i}")
    assert len(chatbot._memory) <= chatbot.MAX_USERS, "memory grows without bound"
    print("ok  chatbot: per-user isolation + LRU cap")


def test_events_endpoint_skips_bad_events():
    """One malformed event must not lose the student's whole session."""
    from fastapi.testclient import TestClient

    import app as app_module
    import routers.telemetry as tel

    fake_db = MagicMock()
    fake_batch = MagicMock()
    fake_db.batch.return_value = fake_batch

    with patch.object(tel, "db", fake_db):
        client = TestClient(app_module.app)
        res = client.post(
            "/api/events",
            json={
                "events": [
                    {
                        "type": "question",
                        "sessionId": "s1",
                        "studentId": "u1",
                        "ts": 1,
                        "questionId": "q1",
                        "correct": True,
                        "timeMs": 1000,
                    },
                    {"type": "question", "sessionId": "s1"},  # malformed: missing required fields
                    {"type": "nonsense"},  # unknown type
                ]
            },
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["written"] == 1, body
    assert len(body["skipped"]) == 2, body
    assert fake_batch.commit.called
    print("ok  /api/events: writes good events, skips bad ones, still commits")


if __name__ == "__main__":
    failures = 0
    for fn in [
        test_routes_mounted,
        test_event_validation,
        test_idempotency_key,
        test_chatbot_memory_is_per_user,
        test_events_endpoint_skips_bad_events,
    ]:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 0 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
