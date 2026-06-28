from config import GOOGLE_API_KEY

from fastapi import FastAPI, File, UploadFile, Form, Body, Depends, HTTPException, Request
from firebase_admin import auth as firebase_auth
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
from cachetools import TTLCache
import threading
from starlette.concurrency import run_in_threadpool
from ingestion import ingest, retrieve

app = FastAPI()
nlp = spacy.load("en_core_web_sm")


async def verify_user(request: Request) -> dict:
    header = request.headers.get("Authorization")
    if not header or not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token")
    token = header[7:]
    try:
        decoded = await run_in_threadpool(firebase_auth.verify_id_token, token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    return decoded

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GOOGLE_API_KEY,
    max_tokens=2048,
    timeout=15,
    max_retries=2,
)

_session_cache: TTLCache[str, ConversationChain] = TTLCache(maxsize=256, ttl=3600)
_cache_lock = threading.Lock()


def _get_chain(session_id: str) -> ConversationChain:
    with _cache_lock:
        chain = _session_cache.get(session_id)
        if chain is None:
            chain = ConversationChain(
                llm=llm,
                verbose=True,
                memory=ConversationBufferMemory(),
            )
            _session_cache[session_id] = chain
        return chain

@app.get("/")
def read_root():
    return {"message": "Welcome to the AI-Powered Easy-Learning Application"}

MAX_PDF_SIZE = 5 * 1024 * 1024
MAX_PDF_PAGES = 20


@app.post("/upload-pdf/")
async def upload_pdf(file: UploadFile = File(...)):
    pdf_data = await file.read()
    if len(pdf_data) > MAX_PDF_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 5 MB size limit")
    try:
        pdf_reader = PdfReader(io.BytesIO(pdf_data))
    except Exception:
        raise HTTPException(status_code=400, detail="File is not a valid PDF")
    if len(pdf_reader.pages) > MAX_PDF_PAGES:
        raise HTTPException(status_code=400, detail="PDF exceeds 20-page limit")
    text = ""
    for page in pdf_reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text
    if text.strip():
        chunks = await run_in_threadpool(ingest, text, file.filename or "pdf")
    else:
        chunks = 0
    return {"text": text, "chunks_ingested": chunks}

@app.post("/simplify-text/")
async def simplify_text(text: str = Body(..., embed=True), _user: dict = Depends(verify_user)):
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
        raise HTTPException(status_code=400, detail=f"Error processing text with spaCy: {e}")
    return {"simplified_text": simplified_text}

@app.post("/add-content/")
async def add_content(text: str = Form(...), _user: dict = Depends(verify_user)):
    try:
        doc_ref = db.collection("content").add({"text": text})
        chunks = await run_in_threadpool(ingest, text, "manual")
        return {"id": doc_ref.id, "chunks_ingested": chunks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-content/")
async def get_content(_user: dict = Depends(verify_user)):
    try:
        content = []
        docs = db.collection("content").stream()
        for doc in docs:
            content.append({"id": doc.id, "text": doc.to_dict()["text"]})
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-quiz/")
async def generate_quiz(text: str = Body(..., embed=True), _user: dict = Depends(verify_user)):
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
        raise HTTPException(status_code=400, detail=f"Error generating quiz: {e}")

@app.post("/chatbot/")
async def chatbot(
    text: str = Body(...),
    session_id: str = Body(...),
    grade_level: str | None = Body(None),
    reading_difficulty: str | None = Body(None),
    _user: dict = Depends(verify_user),
):
    context_docs = await run_in_threadpool(
        retrieve, text, 4, grade_level, reading_difficulty,
    )
    context = "\n\n".join(doc.page_content for doc in context_docs) if context_docs else ""
    prompt = f"Context:\n{context}\n\nQuestion: {text}" if context else text
    chain = _get_chain(session_id)
    response = await run_in_threadpool(chain.predict, input=prompt)
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
