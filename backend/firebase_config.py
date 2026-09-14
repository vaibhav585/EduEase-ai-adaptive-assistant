import firebase_admin
from firebase_admin import credentials, firestore

from config import FIREBASE_CREDENTIALS

db = None

try:
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(FIREBASE_CREDENTIALS))
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as exc:  # noqa: BLE001
    # Firestore being unavailable must not take the whole API down: the content
    # pipeline (simplify / quiz / chatbot) works fine without it, and telemetry
    # degrades to a no-op rather than 500ing every request.
    print(f"[firebase] Firestore unavailable, persistence disabled: {exc}")
