from config import GOOGLE_API_KEY

import google.generativeai as genai

genai.configure(api_key=GOOGLE_API_KEY)

for m in genai.list_models():
    print(m.name)
