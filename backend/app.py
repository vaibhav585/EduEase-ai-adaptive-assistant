import os

try:
    GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
except KeyError as exc:
    raise RuntimeError(
        "GOOGLE_API_KEY is required. Set it in the environment before starting the backend."
    ) from exc

from fastapi import FastAPI, File, UploadFile, Form, Body
from PyPDF2 import PdfReader
import io
import spacy
from firebase_config import db
import random
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_classic.chains import ConversationChain
from langchain_classic.memory import ConversationBufferMemory

app = FastAPI()
nlp = spacy.load("en_core_web_sm")

# Use Google's Gemini LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GOOGLE_API_KEY,
    max_tokens=2048,
)
conversation = ConversationChain(
    llm=llm,
    verbose=True,
    memory=ConversationBufferMemory()
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the AI-Powered Easy-Learning Application"}

@app.post("/upload-pdf/")
async def upload_pdf(file: UploadFile = File(...)):
    text = ""
    try:
        pdf_data = await file.read()
        pdf_reader = PdfReader(io.BytesIO(pdf_data))
        for page in pdf_reader.pages:
            text += page.extract_text()
    except Exception as e:
        return {"error": str(e)}
    return {"text": text}

@app.post("/simplify-text/")
async def simplify_text(text: str = Body(..., embed=True)):
    print(f"Received text for simplification: {text[:200]}...") # Log first 200 chars
    try:
        doc = nlp(text)
        simplified_text = ""
        for sent in doc.sents:
            simplified_sent = ""
            for token in sent:
                # Basic simplification: use lemma for nouns, verbs, adjectives, adverbs
                if token.pos_ in ["NOUN", "VERB", "ADJ", "ADV"]:
                    simplified_sent += token.lemma_ + " "
                else:
                    simplified_sent += token.text + " "
            simplified_text += simplified_sent.strip() + ". "
    except Exception as e:
        print(f"Error processing text with spaCy: {e}")
        return {"error": f"Error processing text with spaCy: {e}"}, 400 # Return 400 Bad Request for processing errors
    return {"simplified_text": simplified_text}

@app.post("/add-content/")
async def add_content(text: str = Form(...)):
    try:
        doc_ref = db.collection("content").add({"text": text})
        return {"id": doc_ref.id}
    except Exception as e:
        return {"error": str(e)}

@app.get("/get-content/")
async def get_content():
    try:
        content = []
        docs = db.collection("content").stream()
        for doc in docs:
            content.append({"id": doc.id, "text": doc.to_dict()["text"]})
        return {"content": content}
    except Exception as e:
        return {"error": str(e)}

@app.post("/generate-quiz/")
async def generate_quiz(text: str = Body(..., embed=True)):
    try:
        doc = nlp(text)
        questions = []
        
        # Collect all relevant words from the document for better distractors
        all_relevant_words = [token.text for token in doc if token.pos_ in ["NOUN", "VERB", "ADJ"]]
        
        for sent in doc.sents:
            if len(sent.text.split()) > 5:
                blanks = [token.text for token in sent if token.pos_ in ["NOUN", "VERB", "ADJ"]]
                if len(blanks) > 0:
                    blank = random.choice(blanks)
                    question = sent.text.replace(blank, "______")
                    options = [blank]
                    
                    # Generate distractors from all_relevant_words
                    # Ensure distractors are not the blank and are unique
                    potential_distractors = [word for word in all_relevant_words if word != blank]
                    random.shuffle(potential_distractors)
                    
                    for _ in range(3):
                        if potential_distractors:
                            options.append(potential_distractors.pop())
                        else:
                            # Fallback if not enough relevant words
                            options.append(f"Option {len(options)}") 
                            
                    random.shuffle(options)
                    questions.append({"question": question, "options": options, "answer": blank})
        return {"questions": questions}
    except Exception as e:
        print(f"Error generating quiz: {e}")
        return {"error": f"Error generating quiz: {e}"}, 400

@app.post("/chatbot/")
async def chatbot(text: str = Body(..., embed=True)):
    print(f"Chatbot received text: {text}")
    response = conversation.predict(input=text)
    print(f"Chatbot LLM response: {response}")
    return {"response": response}


from starlette.middleware.cors import CORSMiddleware
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# from routers import simplify, recommend, log, health, translate, chatbot
# app.include_router(simplify.router, prefix="/api")
# app.include_router(recommend.router, prefix="/api")
# app.include_router(log.router, prefix="/api")
# app.include_router(health.router, prefix="/api")
# app.include_router(translate.router, prefix="/api")
# app.include_router(chatbot.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
