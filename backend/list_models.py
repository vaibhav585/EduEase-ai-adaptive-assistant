import os

import google.generativeai as genai

try:
    GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
except KeyError as exc:
    raise RuntimeError(
        "GOOGLE_API_KEY is required. Set it in the environment before listing models."
    ) from exc

genai.configure(api_key=GOOGLE_API_KEY)

for m in genai.list_models():
    print(m.name)
