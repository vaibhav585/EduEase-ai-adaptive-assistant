"""Teacher dashboard analytics — the piece that replaces TeacherDashboardPage's
hardcoded mock array (roadmap Phase 4.1).

Everything here reads what Phase 0-3 already write: `users/{uid}` for the roster
and profile, `sessions/*` + `sessions/*/events/*` for telemetry, and
`evaluations/*` for DASE scores computed by Phase 2's evaluate() endpoint.

This router computes nothing new about scoring — it aggregates and presents.
DASE math lives in dase_engine.py, on purpose: one place owns "what a score
means", so the dashboard cannot drift from what the engine actually computes.
"""

from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from firebase_admin import firestore as admin_firestore
from pydantic import BaseModel

from firebase_config import db
from services import dase_engine as dase
from services.llm import LLMUnavailable, call_text

router = APIRouter()


def _require_db():
    if db is None:
        raise HTTPException(status_code=503, detail="Persistence unavailable")


# ─────────────── roster ───────────────


@router.get("/analytics/roster")
async def get_roster(teacher_id: Optional[str] = None):
    """Every student, their disability profile, and their MOST RECENT DASE score.

    `teacher_id` is accepted but unused for filtering today — there is no
    class/section model yet (see Carried Forward). Every student account is
    returned. Filtering by class is a Phase 4 follow-up, not a Phase 4.1 blocker.
    """
    _require_db()

    students = [
        {**d.to_dict(), "uid": d.id}
        for d in db.collection("users").where(
            filter=admin_firestore.FieldFilter("role", "==", "student")
        ).stream()
    ]

    roster: List[Dict[str, Any]] = []
    for student in students:
        uid = student["uid"]
        profile = student.get("profile") or {}

        latest = (
            db.collection("evaluations")
            .where(filter=admin_firestore.FieldFilter("studentId", "==", uid))
            .limit(20)  # small per-student scan; sort client-side, see evaluation.py's own note
            .stream()
        )
        evaluations = sorted(
            (d.to_dict() for d in latest), key=lambda e: e.get("computedAt") or 0, reverse=True
        )
        latest_eval = evaluations[0] if evaluations else None

        sessions = list(
            db.collection("sessions")
            .where(filter=admin_firestore.FieldFilter("studentId", "==", uid))
            .limit(50)
            .stream()
        )
        completed = sum(1 for s in sessions if (s.to_dict().get("summary") or {}).get("completed"))

        roster.append(
            {
                "uid": uid,
                "email": student.get("email"),
                "disabilities": profile.get("disabilities", []),
                "primary": profile.get("primary"),
                # None is a real state — "no DASE score yet" must render differently
                # from "scored zero". A dashboard that can't tell those apart
                # misrepresents a student who simply hasn't taken a quiz.
                "daseScore": latest_eval.get("score") if latest_eval else None,
                "coverage": latest_eval.get("coverage") if latest_eval else None,
                "evaluatedAt": latest_eval.get("computedAt") if latest_eval else None,
                "sessionsTotal": len(sessions),
                "sessionsCompleted": completed,
            }
        )

    return {"count": len(roster), "students": roster}


# ─────────────── per-student detail ───────────────


@router.get("/analytics/student/{student_id}")
async def get_student_detail(student_id: str, limit: int = 20):
    """DASE history + error breakdown for one student — feeds the radar chart
    and error pie chart (roadmap 5.1-5.2)."""
    _require_db()

    user_doc = db.collection("users").document(student_id).get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    profile = (user_doc.to_dict() or {}).get("profile") or {}

    docs = (
        db.collection("evaluations")
        .where(filter=admin_firestore.FieldFilter("studentId", "==", student_id))
        .limit(limit)
        .stream()
    )
    evaluations = sorted(
        (d.to_dict() for d in docs), key=lambda e: e.get("computedAt") or 0, reverse=True
    )

    # Trend needs oldest -> newest, everything else (latest score, history list)
    # wants newest first. Keep one sort order and reverse only for the trend.
    trend = [
        {
            "computedAt": e.get("computedAt"),
            "score": e.get("score"),
            "coverage": e.get("coverage"),
        }
        for e in reversed(evaluations)
        if e.get("score") is not None
    ]

    combined_breakdown: Dict[str, int] = defaultdict(int)
    for e in evaluations:
        for label, count in (e.get("errorBreakdown") or {}).get("counts", {}).items():
            combined_breakdown[label] += count

    return {
        "studentId": student_id,
        "profile": profile,
        "latest": evaluations[0] if evaluations else None,
        "trend": trend,
        "errorBreakdownCombined": dict(combined_breakdown),
        "evaluationCount": len(evaluations),
    }


# ─────────────── class-wide aggregates ───────────────


@router.get("/analytics/class")
async def get_class_aggregates():
    """Averages the roster already computed, rather than re-querying — a second
    pass over the same data would double Firestore reads for no new information."""
    roster_resp = await get_roster()
    students = roster_resp["students"]

    scored = [s for s in students if s["daseScore"] is not None]
    by_disability: Dict[str, List[float]] = defaultdict(list)
    for s in scored:
        key = s["primary"] or "none"
        by_disability[key].append(s["daseScore"])

    return {
        "totalStudents": len(students),
        "scoredStudents": len(scored),
        "classAverageScore": (
            round(sum(s["daseScore"] for s in scored) / len(scored), 4) if scored else None
        ),
        "averageByPrimaryDisability": {
            k: round(sum(v) / len(v), 4) for k, v in by_disability.items()
        },
        "averageCompletionRate": (
            round(
                sum(s["sessionsCompleted"] / s["sessionsTotal"] for s in students if s["sessionsTotal"])
                / max(sum(1 for s in students if s["sessionsTotal"]), 1),
                3,
            )
        ),
    }


# ─────────────── AI recommendations ───────────────


class RecommendationRequest(BaseModel):
    studentId: str


RECOMMENDATION_SYSTEM = """You are helping a teacher understand ONE student's learning data
from an accessibility-focused platform. You will be given: the student's disability profile,
their DASE composite score (a disability-weighted composite, not a percentage grade), the
individual parameters behind it, and a breakdown of WHY their wrong answers happened
(knowledge gap, attention lapse, processing delay, or comprehension barrier).

Write 2-4 SHORT, CONCRETE teaching suggestions. Rules:
- Ground every suggestion in a specific number from the data. Never say "consider adjusting
  pacing" without saying which number told you that.
- Never use the DASE score as a grade or an achievement level. It is a support signal.
- If error-cause data shows mostly comprehension barriers, suggest presentation changes
  (format, wording), not "the student should try harder".
- If coverage is low (below 0.6), say so explicitly and note the picture is partial —
  do not give confident advice built on missing data.
- Plain sentences. No headers, no bullet symbols, just short numbered points.
"""


@router.post("/analytics/recommendation")
async def get_recommendation(req: RecommendationRequest):
    """LLM-generated teaching suggestions from one student's DASE profile
    (roadmap 5.3). Cached per evaluation so a dashboard reload does not re-spend
    a Gemini call — recommendations only change when the underlying data does."""
    _require_db()

    detail = await get_student_detail(req.studentId, limit=1)
    latest = detail["latest"]
    if not latest:
        return {
            "studentId": req.studentId,
            "recommendation": "No quiz or lesson data yet for this student.",
            "degraded": False,
        }

    cache_key = f"{req.studentId}_{latest.get('computedAt')}"
    cached = db.collection("recommendation_cache").document(cache_key).get()
    if cached.exists:
        return {**cached.to_dict(), "studentId": req.studentId, "cached": True}

    breakdown = (latest.get("errorBreakdown") or {}).get("proportions", {})
    prompt = (
        f"Disability profile: {detail['profile']}\n"
        f"DASE score: {latest.get('score')} (coverage: {latest.get('coverage')})\n"
        f"Parameters: {latest.get('parameters')}\n"
        f"Diagnostic-only (reported, not scored): {latest.get('diagnosticOnly')}\n"
        f"Error cause breakdown (proportions): {breakdown}\n"
    )

    try:
        text = call_text(RECOMMENDATION_SYSTEM, prompt)
        degraded = False
    except LLMUnavailable as exc:
        print(f"[analytics] recommendation LLM unavailable: {exc}")
        text = (
            "AI recommendations are temporarily unavailable. Review the error-cause "
            "breakdown and DASE parameters above directly."
        )
        degraded = True

    result = {"recommendation": text, "degraded": degraded}
    if not degraded:
        db.collection("recommendation_cache").document(cache_key).set(result)
    return {**result, "studentId": req.studentId, "cached": False}
