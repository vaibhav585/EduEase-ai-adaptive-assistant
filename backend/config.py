import os

# API Keys (replace with your actual keys)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "your_openai_api_key")

# Translation settings
ARGOSTRANSLATE_PACKAGE_PATH = os.environ.get("ARGOSTRANSLATE_PACKAGE_PATH", "./packages")

# Logging
LOG_FILE = "logs.jsonl"