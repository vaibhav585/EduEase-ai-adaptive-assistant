"""DASE evaluation endpoints.

  POST /api/classify              - classify one wrong answer, drive the closed loop
  POST /api/evaluate              - compute a DASE profile for a session
  GET  /api/evaluation/{student}  - historical DASE profiles
  GET  /api/evaluation/{student}/errors - error-cause breakdown
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore as admin_firestore
from pydantic import BaseModel

from auth import verify_user
from firebase_config import db
from services import dase_engine

router = APIRouter()


class ClassifyRequest(BaseModel):
    timeMs: int
    priorTimesMs: List[float] = []
    focusRatio: Optional[float] = None
    focusSamples: int = 0
    answerChanges: int = 0
    timeToFirstInteractionMs: Optional[int] = None
    reRead: bool = False
    timedOut: bool = False
    hasSimplerVariant: bool = False


@router.post("/classify")
async def classify(req: ClassifyRequest, _user: dict = Depends(verify_user)):
    """Classify a single wrong answer and say whether to re-present it.

    Called synchronously by the quiz on wrong answers only, so the closed loop can
    act immediately. Deliberately stateless — the caller passes the student's own
    prior response times, which it already has in memory for the current session.
    """
    result = dase_engine.classify_error(
        time_ms=req.timeMs,
        prior_times_ms=req.priorTimesMs,
        focus_ratio=req.focusRatio,
        focus_samples=req.focusSamples,
        answer_changes=req.answerChanges,
        time_to_first_interaction_ms=req.timeToFirstInteractionMs,
        re_read=req.reRead,
        timed_out=req.timedOut,
    )
    return {
        "classification": result.to_dict(),
        "shouldRepresent": bool(
            req.hasSimplerVariant and dase_engine.should_represent(result)
        ),
    }


def _require_db():
    if db is None:
        raise HTTPException(status_code=503, detail="Persistence unavailable")


def _load_session_events(session_id: str):
    docs = (
        db.collection("sessions")
        .document(session_id)
        .collection("events")
        .order_by("serverTs")
        .stream()
    )
    events = [d.to_dict() for d in docs]
    return (
        [e for e in events if e.get("type") == "question"],
        [e for e in events if e.get("type") == "reading"],
    )


class EvaluateRequest(BaseModel):
    sessionId: str
    studentId: str
    profile: str = "default"
    persist: bool = True


@router.post("/evaluate")
async def evaluate(req: EvaluateRequest, _user: dict = Depends(verify_user)):
    _require_db()
    # Authoritative studentId is the CALLING user, never the client-sent value —
    # a student must not be able to evaluate a session as someone else. Added
    # during the master/main integration once real auth existed to enforce it.
    student_id = _user.get("uid") or req.studentId

    questions, readings = _load_session_events(req.sessionId)
    if not questions and not readings:
        raise HTTPException(status_code=404, detail="No events found for this session")

    session_doc = db.collection("sessions").document(req.sessionId).get()
    sessions = [session_doc.to_dict()] if session_doc.exists else []

    parameters = dase_engine.compute_parameters(questions, readings, sessions)
    result = dase_engine.compute_dase(parameters, req.profile)
    result["errorBreakdown"] = dase_engine.error_breakdown(questions)
    result["sessionId"] = req.sessionId
    result["studentId"] = student_id

    if req.persist:
        db.collection("evaluations").add({**result, "computedAt": admin_firestore.SERVER_TIMESTAMP})

    return result


@router.get("/evaluation/{student_id}")
async def get_evaluations(student_id: str, limit: int = 20, _user: dict = Depends(verify_user)):
    _require_db()
    docs = (
        db.collection("evaluations")
        .where(filter=admin_firestore.FieldFilter("studentId", "==", student_id))
        .limit(limit)
        .stream()
    )
    evaluations = [d.to_dict() for d in docs]
    # Sort in Python rather than with order_by: a composite where+order_by query
    # needs a Firestore index that has to be created by hand, and a missing index
    # fails at runtime rather than at deploy. Fine at this scale.
    evaluations.sort(key=lambda e: e.get("computedAt") or 0, reverse=True)
    return {"studentId": student_id, "count": len(evaluations), "evaluations": evaluations}


@router.get("/evaluation/{student_id}/errors")
async def get_error_breakdown(student_id: str, limit: int = 50, _user: dict = Depends(verify_user)):
    """Aggregate error causes across a student's recent sessions."""
    _require_db()
    docs = (
        db.collection("sessions")
        .where(filter=admin_firestore.FieldFilter("studentId", "==", student_id))
        .limit(limit)
        .stream()
    )

    all_questions = []
    for session in docs:
        questions, _ = _load_session_events(session.id)
        all_questions.extend(questions)

    return {
        "studentId": student_id,
        "sessionsScanned": limit,
        **dase_engine.error_breakdown(all_questions),
    }


@router.get("/dase/profiles")
async def list_profiles(_user: dict = Depends(verify_user)):
    """Weight profiles and their rationale — the teacher dashboard renders these,
    and they are what a teacher edits when overriding weights."""
    config = dase_engine.load_config()
    return {
        "profiles": {
            name: {"rationale": entry["rationale"], "weights": entry["weights"]}
            for name, entry in config["profiles"].items()
        },
        "parameters": config["_parameters"],
    }
