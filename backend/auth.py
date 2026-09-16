"""Shared Firebase auth dependencies.

Extracted from app.py during the master/main integration so the new routers
(evaluation, telemetry, voice_intent, analytics) can require the same real
token verification app.py's original endpoints already used, without a
circular import back into app.py.
"""

from fastapi import Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from firebase_config import db, verify_firebase_token


async def verify_user(request: Request) -> dict:
    header = request.headers.get("Authorization")
    if not header or not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token")
    token = header[7:]
    try:
        decoded = await run_in_threadpool(verify_firebase_token, token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    # Firebase tokens use 'sub' for UID; normalise to 'uid' for the rest of the app
    if "uid" not in decoded:
        decoded = {**decoded, "uid": decoded.get("sub", "")}
    return decoded


# Maps known demo email addresses to their intended roles.
# Auto-provisioning uses this so teacher/admin logins work on first access
# even when their Firestore profile doesn't exist yet.
_DEMO_ROLE_MAP: dict[str, str] = {
    "admin@test.com": "admin",
    "teacher1@test.com": "teacher",
    "teacher2@test.com": "teacher",
    "teacher3@test.com": "teacher",
}


def verify_role(required_role: str):
    async def _check(user: dict = Depends(verify_user)) -> dict:
        uid = user.get("uid")
        email = user.get("email", "")
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid token")
        if db is None:
            raise HTTPException(status_code=503, detail="Persistence unavailable")
        try:
            user_doc = db.collection("users").document(uid).get()
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to verify role")
        if not user_doc.exists:
            # Auto-provision: first login creates a profile with the correct role
            role = _DEMO_ROLE_MAP.get(email, "student")
            db.collection("users").document(uid).set({"email": email, "role": role})
            if role != required_role:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            user["role"] = role
            return user
        role = user_doc.to_dict().get("role", "")
        if role != required_role:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        user["role"] = role
        return user
    return _check
