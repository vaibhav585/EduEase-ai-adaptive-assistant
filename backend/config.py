import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    # Fail loudly at import rather than mysteriously at the first LLM call.
    raise RuntimeError(
        "GOOGLE_API_KEY is not set. Copy backend/.env.example to backend/.env and fill it in."
    )

FIREBASE_CREDENTIALS = BASE_DIR / os.environ.get("FIREBASE_CREDENTIALS", "serviceAccountKey.json")

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:5174"
    ).split(",")
    if o.strip()
]

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Optional fallback provider — Gemini's free tier is 5 req/min and 20 req/day
# (measured; see PHASE_LEARNINGS.md Phase 2 §2.8), which one afternoon of
# development already exhausts. Groq's free tier is far more generous. Unset
# means text calls degrade straight to each caller's non-LLM fallback, same as
# before this existed.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

ARGOSTRANSLATE_PACKAGE_PATH = os.environ.get("ARGOSTRANSLATE_PACKAGE_PATH", "./packages")
LOG_FILE = BASE_DIR / "logs.jsonl"

# Firebase project the frontend authenticates against — tokens are verified
# against Google public keys, not the service-account key, so this can differ
# from whatever project serviceAccountKey.json belongs to.
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "ai-learning-app-3025f")
