import google.generativeai as genai

genai.configure(api_key="AIzaSyDulZ85HF2Ci19CFHaenU0mkUyg9qzIrlc")

for m in genai.list_models():
    print(m.name)
