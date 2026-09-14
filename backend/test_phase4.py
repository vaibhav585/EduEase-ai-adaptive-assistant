"""Phase 4 self-check — teacher dashboard analytics. Run: python test_phase4.py

No live Firestore: the router's own logic (null-vs-zero, aggregation math,
caching) is tested against a fake `db`, since the real integrity check is
"does a route exist and read the collections the other phases actually write".
"""

import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient


def _fake_doc(data, doc_id="doc1"):
    d = MagicMock()
    d.to_dict.return_value = data
    d.id = doc_id
    d.exists = True
    return d


def test_routes_mounted():
    import app

    paths = {r.path for r in app.app.routes}
    for p in (
        "/api/analytics/roster",
        "/api/analytics/student/{student_id}",
        "/api/analytics/class",
        "/api/analytics/recommendation",
    ):
        assert p in paths, f"{p} not mounted"
    print("ok  routes: all four analytics endpoints mounted")


def test_roster_reports_null_not_zero_for_unscored_student():
    """A student who hasn't taken a quiz must show as 'no data', never as a 0%
    score — 0 would misrepresent them as failing rather than unmeasured."""
    import routers.analytics as analytics

    fake_db = MagicMock()
    fake_db.collection.return_value.where.return_value.stream.return_value = [
        _fake_doc({"email": "a@x.com", "role": "student", "profile": {}}, "u1")
    ]
    fake_db.collection.return_value.where.return_value.limit.return_value.stream.return_value = []

    async def run():
        with patch.object(analytics, "db", fake_db):
            return await analytics.get_roster()

    import asyncio

    result = asyncio.run(run())
    student = result["students"][0]
    assert student["daseScore"] is None, "unscored student must be None, not 0"
    assert student["coverage"] is None
    print("ok  roster: unscored student reports null, not a misleading zero")


def test_class_average_excludes_unscored_students():
    """Averaging in None as 0 would drag the class average down by however many
    students simply haven't taken a quiz yet — a data-completeness bug pretending
    to be a performance signal."""
    import routers.analytics as analytics

    async def fake_get_roster(teacher_id=None):
        return {
            "count": 3,
            "students": [
                {"uid": "u1", "daseScore": 0.8, "primary": "adhd", "sessionsTotal": 5, "sessionsCompleted": 5},
                {"uid": "u2", "daseScore": 0.6, "primary": "adhd", "sessionsTotal": 4, "sessionsCompleted": 2},
                {"uid": "u3", "daseScore": None, "primary": None, "sessionsTotal": 0, "sessionsCompleted": 0},
            ],
        }

    import asyncio

    with patch.object(analytics, "get_roster", fake_get_roster):
        result = asyncio.run(analytics.get_class_aggregates())

    assert result["scoredStudents"] == 2
    assert abs(result["classAverageScore"] - 0.7) < 1e-6, "average must be over scored students only"
    assert abs(result["averageByPrimaryDisability"]["adhd"] - 0.7) < 1e-6
    print(f"ok  class average: {result['classAverageScore']} over {result['scoredStudents']}/3 scored (unscored excluded)")


def test_recommendation_is_cached_per_evaluation():
    """A dashboard reload must not re-spend a Gemini call — the cache key is tied
    to the evaluation's computedAt, so a NEW evaluation invalidates it naturally."""
    import routers.analytics as analytics

    fake_db = MagicMock()
    cache_doc = MagicMock()
    cache_doc.exists = True
    cache_doc.to_dict.return_value = {"recommendation": "cached text", "degraded": False}
    fake_db.collection.return_value.document.return_value.get.return_value = cache_doc

    async def fake_detail(student_id, limit=1):
        return {
            "profile": {},
            "latest": {"computedAt": "2025-01-01", "score": 0.7, "coverage": 0.9, "parameters": {}, "diagnosticOnly": {}, "errorBreakdown": {"proportions": {}}},
        }

    import asyncio

    with patch.object(analytics, "db", fake_db), patch.object(
        analytics, "get_student_detail", fake_detail
    ):
        result = asyncio.run(
            analytics.get_recommendation(analytics.RecommendationRequest(studentId="u1"))
        )

    assert result["cached"] is True
    assert result["recommendation"] == "cached text"
    print("ok  recommendation: cache hit avoids a Gemini call")


def test_recommendation_handles_no_data():
    import routers.analytics as analytics

    fake_db = MagicMock()

    async def fake_detail(student_id, limit=1):
        return {"profile": {}, "latest": None}

    import asyncio

    with patch.object(analytics, "db", fake_db), patch.object(
        analytics, "get_student_detail", fake_detail
    ):
        result = asyncio.run(
            analytics.get_recommendation(analytics.RecommendationRequest(studentId="u1"))
        )

    assert "No quiz" in result["recommendation"]
    assert result["degraded"] is False
    print("ok  recommendation: no-data student handled without calling the LLM")


def test_recommendation_degrades_honestly_on_llm_failure():
    import routers.analytics as analytics
    from services.llm import LLMUnavailable

    fake_db = MagicMock()
    no_cache = MagicMock()
    no_cache.exists = False
    fake_db.collection.return_value.document.return_value.get.return_value = no_cache

    async def fake_detail(student_id, limit=1):
        return {
            "profile": {},
            "latest": {"computedAt": "t1", "score": 0.5, "coverage": 0.5, "parameters": {}, "diagnosticOnly": {}, "errorBreakdown": {"proportions": {}}},
        }

    import asyncio

    with patch.object(analytics, "db", fake_db), patch.object(
        analytics, "get_student_detail", fake_detail
    ), patch.object(analytics, "call_text", side_effect=LLMUnavailable("quota")):
        result = asyncio.run(
            analytics.get_recommendation(analytics.RecommendationRequest(studentId="u1"))
        )

    assert result["degraded"] is True
    assert "unavailable" in result["recommendation"].lower()
    # A degraded result must not poison the cache with a placeholder message.
    fake_db.collection.return_value.document.return_value.set.assert_not_called()
    print("ok  recommendation: LLM failure degrades honestly, does not poison the cache")


def test_class_endpoint_reuses_roster_not_a_second_query_pass():
    """Re-querying Firestore for the same data the roster already fetched would
    double reads for zero new information."""
    import routers.analytics as analytics
    import inspect

    src = inspect.getsource(analytics.get_class_aggregates)
    assert "get_roster()" in src, "class aggregates must reuse get_roster(), not re-query"
    print("ok  class aggregates: reuses roster data instead of a second Firestore pass")


def test_quizpage_triggers_evaluation_after_finishing():
    """Regression for the bug reported 2025: the dashboard showed profile and
    session counts but no DASE score at all, because nothing ever called
    POST /api/evaluate — the engine existed, but no trigger called it, so
    evaluations/* was permanently empty and the roster had nothing to read.

    Static check (grepping the source) rather than a browser test: this repo has
    no frontend test runner, and the actual bug was an ABSENT call, which a
    runtime test can't distinguish from "ran but did nothing". Asserting the
    call site exists is the cheapest thing that fails if it's deleted again.
    """
    from pathlib import Path

    quiz_page = (
        Path(__file__).resolve().parent.parent / "frontend" / "src" / "pages" / "QuizPage.tsx"
    ).read_text(encoding="utf-8")

    assert "triggerEvaluation" in quiz_page, "QuizPage no longer calls triggerEvaluation"
    # Check any import line mentions it, not a specific line NUMBER — Phase 6
    # added an icon-import line above it and shifted every later line down by
    # one, which broke an earlier version of this assertion that hardcoded
    # line index 7. The import's presence is what matters, not its position.
    import_lines = [ln for ln in quiz_page.split("\n") if ln.strip().startswith("import")]
    assert any("triggerEvaluation" in ln and "services/telemetry" in ln for ln in import_lines), (
        "triggerEvaluation must be imported from services/telemetry"
    )

    telemetry = (
        Path(__file__).resolve().parent.parent
        / "frontend"
        / "src"
        / "services"
        / "telemetry.ts"
    ).read_text(encoding="utf-8")
    assert "/api/evaluate" in telemetry, "telemetry.ts no longer calls the evaluate endpoint"
    print("ok  QuizPage calls triggerEvaluation -> POST /api/evaluate on quiz completion")


if __name__ == "__main__":
    tests = [
        test_routes_mounted,
        test_roster_reports_null_not_zero_for_unscored_student,
        test_class_average_excludes_unscored_students,
        test_recommendation_is_cached_per_evaluation,
        test_recommendation_handles_no_data,
        test_recommendation_degrades_honestly_on_llm_failure,
        test_class_endpoint_reuses_roster_not_a_second_query_pass,
        test_quizpage_triggers_evaluation_after_finishing,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 4 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
