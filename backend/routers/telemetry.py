"""Telemetry ingest — the data layer DASE (Phase 2) reads from.

Event shapes are frozen in DATA_CONTRACT.md v1.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore as admin_firestore

from auth import verify_user
from firebase_config import db
from models.schemas import (
    EventBatch,
    QuestionEvent,
    ReadingEvent,
    SessionEnd,
    SessionStart,
    VoiceEvent,
)

router = APIRouter()

_EVENT_TYPES = {"question": QuestionEvent, "reading": ReadingEvent, "voice": VoiceEvent}


def _require_db():
    if db is None:
        raise HTTPException(status_code=503, detail="Persistence unavailable (Firestore not configured)")


def _event_key(event: dict) -> str:
    """Idempotency key: re-sending a batch must not double-count a question.

    A question can legitimately appear twice in one session when the Phase 2.4
    closed loop re-presents it, so `attempts` is part of the key.
    """
    if event.get("type") == "question":
        return f"q_{event['questionId']}_{event.get('attempts', 1)}"
    if event.get("type") == "voice":
        return f"v_{uuid.uuid4().hex}"
    return f"r_{uuid.uuid4().hex}"


@router.post("/sessions")
async def start_session(payload: SessionStart, _user: dict = Depends(verify_user)):
    _require_db()
    # Authoritative studentId is the calling user — added during the master/main
    # integration once real auth existed to enforce this rather than trust a
    # client-supplied id.
    student_id = _user.get("uid") or payload.studentId
    doc = {
        "studentId": student_id,
        "kind": payload.kind,
        "contentId": payload.contentId,
        "startedAt": admin_firestore.SERVER_TIMESTAMP,
        "endedAt": None,
        "summary": None,
    }
    ref = db.collection("sessions").document()
    ref.set(doc)
    return {"sessionId": ref.id}


@router.post("/events")
async def ingest_events(batch: EventBatch, _user: dict = Depends(verify_user)):
    """Batch-write events. Validates each against its type schema and skips bad ones
    rather than failing the whole batch — losing one malformed event beats losing a
    student's entire session."""
    _require_db()

    written, skipped = 0, []
    bulk = db.batch()

    for raw in batch.events:
        model = _EVENT_TYPES.get(raw.get("type"))
        if model is None:
            skipped.append({"reason": "unknown type", "type": raw.get("type")})
            continue
        try:
            event = model(**raw)
        except Exception as exc:  # noqa: BLE001
            skipped.append({"reason": str(exc)[:200]})
            continue

        data = event.model_dump()
        data["studentId"] = _user.get("uid") or data.get("studentId")
        # serverTs is the trustworthy clock — client `ts` is kept but never used for analysis.
        data["serverTs"] = admin_firestore.SERVER_TIMESTAMP
        ref = (
            db.collection("sessions")
            .document(event.sessionId)
            .collection("events")
            .document(_event_key(data))
        )
        bulk.set(ref, data)
        written += 1

    if written:
        bulk.commit()
    return {"written": written, "skipped": skipped}


@router.patch("/sessions/{session_id}")
async def end_session(session_id: str, payload: SessionEnd, _user: dict = Depends(verify_user)):
    _require_db()
    db.collection("sessions").document(session_id).update(
        {"summary": payload.summary.model_dump(), "endedAt": admin_firestore.SERVER_TIMESTAMP}
    )
    return {"status": "ok"}


@router.get("/sessions/{session_id}/events")
async def get_events(session_id: str, _user: dict = Depends(verify_user)):
    """Read back a session. Phase 2 (DASE) and Phase 4 (dashboard) both consume this."""
    _require_db()
    events = [
        doc.to_dict()
        for doc in db.collection("sessions")
        .document(session_id)
        .collection("events")
        .order_by("serverTs")
        .stream()
    ]
    return {"sessionId": session_id, "count": len(events), "events": events}
