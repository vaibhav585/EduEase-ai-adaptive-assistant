"""Teacher dashboard analytics — the key merge of the master/main integration.

`main` solved "which students does this teacher see" (a real `teacher_id` field
on each student, queried against the calling teacher's own uid via
`Depends(verify_role("teacher"))`) — the exact gap master's Phase 4 flagged as
its single highest-priority open issue (see BRANCH_COMPARISON.md §5).

`master` solved "how do we score them well" — DASE, a disability-weighted
composite over measured parameters, plus error-cause classification.

This router puts DASE's per-student computation BEHIND main's per-teacher
roster filter, rather than either replacing the other. main's OLDER
`/teacher/analytics/{student_id}` endpoint in app.py (quiz/session summaries,
no DASE) is left in place unchanged for backward compatibility; this is the
new one the rebuilt teacher dashboard calls.
"""

from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore as admin_firestore
from pydantic import BaseModel

from auth import verify_role
from firebase_config import db
from services import dase_engine as dase
from services.llm import LLMUnavailable, call_text

router = APIRouter()


def _require_db():
    if db is None:
        raise HTTPException(status_code=503, detail="Persistence unavailable")


async def _teacher_roster(teacher_uid: str) -> List[Dict[str, Any]]:
    """main's exact roster query (app.py /teacher/students), reused here so the
    DASE-scored roster and the plain roster can never silently diverge."""
    docs = (
        db.collection("users")
        .where("role", "==", "student")
        .where("teacher_id", "==", teacher_uid)
        .stream()
    )
    return [{**d.to_dict(), "uid": d.id} for d in docs]


@router.get("/analytics/roster")
async def get_roster(_user: dict = Depends(verify_role("teacher"))):
    """Every student assigned to the CALLING teacher (not every student in the
    deployment — that was master's Phase 4 bug), with their most recent DASE
    score. `daseScore: None` means no evaluation yet, never a misleading 0."""
    _require_db()
    teacher_uid = _user.get("uid", "")
    students = await _teacher_roster(teacher_uid)

    roster: List[Dict[str, Any]] = []
    for student in students:
        uid = student["uid"]

        evals = list(
            db.collection("evaluations")
            .where(filter=admin_firestore.FieldFilter("studentId", "==", uid))
            .limit(20)
            .stream()
        )
        evaluations = sorted(
            (d.to_dict() for d in evals), key=lambda e: e.get("computedAt") or 0, reverse=True
        )
        latest_eval = evaluations[0] if evaluations else None

        sessions = list(
            db.collection("sessions")
            .where(filter=admin_firestore.FieldFilter("studentId", "==", uid))
            .limit(50)
            .stream()
        )
        completed = sum(1 for s in sessions if (s.to_dict().get("summary") or {}).get("completed"))

        roster.append({
            "uid": uid,
            "email": student.get("email"),
            "gradeLevel": student.get("grade_level"),
            "disabilities": (student.get("profile") or {}).get("disabilities", []),
            "primary": (student.get("profile") or {}).get("primary"),
            "daseScore": latest_eval.get("score") if latest_eval else None,
            "coverage": latest_eval.get("coverage") if latest_eval else None,
            "evaluatedAt": latest_eval.get("computedAt") if latest_eval else None,
            "sessionsTotal": len(sessions),
            "sessionsCompleted": completed,
        })

    return {"count": len(roster), "students": roster}


@router.get("/analytics/student/{student_id}")
async def get_student_detail(
    student_id: str, limit: int = 20, _user: dict = Depends(verify_role("teacher")),
):
    """DASE history + error breakdown for one student. Scoped: 404s (not a
    silent empty result) if the student isn't on the calling teacher's roster —
    a teacher must not be able to view a student outside their own class by
    guessing a uid."""
    _require_db()
    teacher_uid = _user.get("uid", "")
    roster_uids = {s["uid"] for s in await _teacher_roster(teacher_uid)}
    if student_id not in roster_uids:
        raise HTTPException(status_code=404, detail="Student not found on your roster")

    user_doc = db.collection("users").document(student_id).get()
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

    trend = [
        {"computedAt": e.get("computedAt"), "score": e.get("score"), "coverage": e.get("coverage")}
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


@router.get("/analytics/class")
async def get_class_aggregates(_user: dict = Depends(verify_role("teacher"))):
    """Reuses get_roster() rather than re-querying — a second pass over the
    same data would double Firestore reads for no new information."""
    roster_resp = await get_roster(_user)
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


class RecommendationRequest(BaseModel):
    studentId: str


RECOMMENDATION_SYSTEM = """You are helping a teacher understand ONE student's learning data
from an accessibility-focused platform. You will be given: the student's disability profile,
their DASE composite score (a disability-weighted composite, not a percentage grade), the
individual parameters behind it, and a breakdown of WHY their wrong answers happened
(knowledge gap, attention lapse, processing delay, or comprehension barrier).

Write 2-4 SHORT, CONCRETE teaching suggestions. Rules:
- Ground every suggestion in a specific number from the data.
- Never use the DASE score as a grade or an achievement level. It is a support signal.
- If error-cause data shows mostly comprehension barriers, suggest presentation changes
  (format, wording), not "the student should try harder".
- If coverage is low (below 0.6), say so explicitly — the picture is partial.
- Plain sentences. No headers, no bullet symbols, just short numbered points.
"""


@router.post("/analytics/recommendation")
async def get_recommendation(
    req: RecommendationRequest, _user: dict = Depends(verify_role("teacher")),
):
    """LLM-generated teaching suggestions from one student's DASE profile,
    cached per evaluation so a dashboard reload does not re-spend a Gemini call."""
    _require_db()

    detail = await get_student_detail(req.studentId, limit=1, _user=_user)
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
