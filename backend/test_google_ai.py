import os

import google.generativeai as genai

try:
    GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
except KeyError as exc:
    raise RuntimeError(
        "GOOGLE_API_KEY is required. Set it in the environment before running this script."
    ) from exc

genai.configure(api_key=GOOGLE_API_KEY)

model = genai.GenerativeModel('gemini-2.5-flash')

response = model.generate_content("What is the meaning of life?")

print(response.text)
