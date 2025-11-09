import google.generativeai as genai

genai.configure(api_key="AIzaSyDulZ85HF2Ci19CFHaenU0mkUyg9qzIrlc")

model = genai.GenerativeModel('gemini-2.5-flash')

response = model.generate_content("What is the meaning of life?")

print(response.text)
