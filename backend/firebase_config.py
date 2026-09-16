import firebase_admin
from firebase_admin import credentials, firestore
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from config import FIREBASE_CREDENTIALS, FIREBASE_PROJECT_ID

db = None

try:
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(FIREBASE_CREDENTIALS))
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as exc:  # noqa: BLE001
    # Firestore being unavailable must not take the whole API down: pure
    # LLM-pipeline endpoints (simplify / quiz / chatbot) work fine without it,
    # and telemetry/persistence degrades to a clear 503 rather than crashing
    # the process on import.
    print(f"[firebase] Firestore unavailable, persistence disabled: {exc}")

_google_request = google_requests.Request()


def verify_firebase_token(id_token_str: str) -> dict:
    """Verify a Firebase ID token using Google's public signing keys.

    Deliberately independent of the service-account credential above — this
    works against FIREBASE_PROJECT_ID regardless of which project
    serviceAccountKey.json belongs to, so a mismatch between the two (as this
    project actually had — see BRANCH_COMPARISON.md §8) fails loudly with an
    auth error instead of silently authenticating against the wrong project.
    """
    return google_id_token.verify_firebase_token(
        id_token_str, _google_request, audience=FIREBASE_PROJECT_ID
    )
