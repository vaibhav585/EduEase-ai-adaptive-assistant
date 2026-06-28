import os

try:
    GOOGLE_API_KEY: str = os.environ["GOOGLE_API_KEY"]
except KeyError as exc:
    raise RuntimeError(
        "GOOGLE_API_KEY is required. Set it in the environment before starting the backend."
    ) from exc

# Translation settings
ARGOSTRANSLATE_PACKAGE_PATH = os.environ.get("ARGOSTRANSLATE_PACKAGE_PATH", "./packages")

# Logging
LOG_FILE = "logs.jsonl"
