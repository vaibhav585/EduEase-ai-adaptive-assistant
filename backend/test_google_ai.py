from config import GOOGLE_API_KEY

import google.generativeai as genai

genai.configure(api_key=GOOGLE_API_KEY)

model = genai.GenerativeModel('gemini-2.5-flash')

response = model.generate_content("What is the meaning of life?")

print(response.text)
