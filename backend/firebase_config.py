
import os
import firebase_admin
from firebase_admin import credentials, firestore
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# The Firebase project the frontend uses for auth. May differ from the service
# account project — tokens are verified via Google's public keys, not the SA key.
_FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "eduease-b955c")
_google_request = google_requests.Request()


def verify_firebase_token(id_token_str: str) -> dict:
    """Verify a Firebase ID token using Google's public signing keys.
    Works regardless of which project the service account key belongs to."""
    return google_id_token.verify_firebase_token(
        id_token_str, _google_request, audience=_FIREBASE_PROJECT_ID
    )
