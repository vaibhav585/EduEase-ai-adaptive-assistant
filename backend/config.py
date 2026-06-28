import os
from dotenv import load_dotenv

# Force load variables from the local .env file
load_dotenv()

try:
    GOOGLE_API_KEY: str = os.environ["GOOGLE_API_KEY"]
except KeyError as exc:
    raise RuntimeError(
        "GOOGLE_API_KEY is required. Please check that your backend/.env file contains this key."
    ) from exc

# Translation settings
ARGOSTRANSLATE_PACKAGE_PATH = os.environ.get("ARGOSTRANSLATE_PACKAGE_PATH", "./packages")

# Logging
LOG_FILE = "logs.jsonl"