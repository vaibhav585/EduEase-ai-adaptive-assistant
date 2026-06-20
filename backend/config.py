import os

# Optional legacy configuration; no OpenAI integration currently consumes this.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Translation settings
ARGOSTRANSLATE_PACKAGE_PATH = os.environ.get("ARGOSTRANSLATE_PACKAGE_PATH", "./packages")

# Logging
LOG_FILE = "logs.jsonl"
