from config import GOOGLE_API_KEY

from fastapi import FastAPI, File, UploadFile, Form, Body, Depends, HTTPException, Request
from firebase_admin import auth as firebase_auth
from PyPDF2 import PdfReader
import io
import json
import re
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
from datetime import datetime, timezone
from models.schemas import TurnSentiment, ChatbotResponse, QuizResultLog, SessionTelemetryLog

app = FastAPI()
nlp = spacy.load("en_core_web_sm")

SAFE_FALLBACK = (
    "Let's focus on our reading material together! "
    "What else would you like to explore in the text?"
)

_INJECTION_PATTERNS = re.compile(
    r"(?i)"
    r"(?:ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions)"
    r"|(?:disregard\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|rules|prompts))"
    r"|(?:you\s+are\s+now\s+(?:a|an|in)\b)"
    r"|(?:act\s+as\s+(?:a|an)\b)"
    r"|(?:pretend\s+(?:you(?:'re|\s+are)\s+))"
    r"|(?:bypass\s+(?:safety|content|filter|guardrail))"
    r"|(?:jailbreak)"
    r"|(?:do\s+anything\s+now)"
    r"|(?:system\s*:\s)"
    r"|(?:\bDAN\b)"
)

_PII_EMAIL = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}")
_PII_PHONE = re.compile(
    r"(?<!\d)"
    r"(?:\+?\d{1,3}[\s.-]?)?"
    r"(?:\(?\d{3}\)?[\s.-]?)"
    r"\d{3}[\s.-]?\d{4}"
    r"(?!\d)"
)
_PII_ZIP = re.compile(r"\b\d{5}(?:-\d{4})?\b")

_TOXIC_PHRASES = re.compile(
    r"(?i)"
    r"(?:kill\s+(?:yourself|your\s*self|him|her|them))"
    r"|(?:you\s+(?:are|'re)\s+(?:stupid|dumb|worthless|an?\s+idiot))"
    r"|(?:self[- ]?harm)"
    r"|(?:suicide\s+(?:method|how\s+to))"
    r"|(?:nobody\s+(?:loves|cares\s+about)\s+you)"
    r"|(?:you\s+deserve\s+to\s+(?:die|suffer))"
    r"|(?:shut\s+up\s+(?:you\s+)?(?:idiot|moron|stupid))"
)


def _sanitize_pii(text: str) -> str:
    text = _PII_EMAIL.sub("[EMAIL]", text)
    text = _PII_PHONE.sub("[PHONE]", text)
    text = _PII_ZIP.sub("[ZIP]", text)
    return text


def _validate_input(text: str) -> tuple[bool, str]:
    if _INJECTION_PATTERNS.search(text):
        return False, text
    sanitized = _sanitize_pii(text)
    return True, sanitized


def _validate_output(text: str) -> bool:
    return not _TOXIC_PHRASES.search(text)


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


def verify_role(required_role: str):
    async def _check(user: dict = Depends(verify_user)) -> dict:
        uid = user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid token")
        try:
            user_doc = db.collection("users").document(uid).get()
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to verify role")
        if not user_doc.exists:
            raise HTTPException(status_code=403, detail="User profile not found")
        role = user_doc.to_dict().get("role", "")
        if role != required_role:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        user["role"] = role
        return user
    return _check

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GOOGLE_API_KEY,
    max_tokens=2048,
    timeout=15,
    max_retries=2,
)

_sentiment_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GOOGLE_API_KEY,
    max_tokens=256,
    timeout=10,
    max_retries=1,
)

_SENTIMENT_PROMPT = (
    "You are a child-psychology tone classifier. Given a student's message and the assistant's reply, "
    "output ONLY a JSON object with exactly two keys:\n"
    '  "frustration_score": a float from 0.0 (calm) to 1.0 (very frustrated),\n'
    '  "suggested_action": one of "continue", "simplify", or "offer_break".\n'
    "Rules:\n"
    '- If frustration_score > 0.7, suggested_action MUST be "offer_break".\n'
    '- If frustration_score > 0.4, suggested_action SHOULD be "simplify".\n'
    '- Otherwise use "continue".\n'
    "Output raw JSON only. No markdown, no explanation."
)

_DEFAULT_SENTIMENT = TurnSentiment(frustration_score=0.0, suggested_action="continue")


def _score_sentiment(user_text: str, bot_reply: str) -> TurnSentiment:
    try:
        prompt = (
            f"{_SENTIMENT_PROMPT}\n\n"
            f"Student message: {user_text[:500]}\n"
            f"Assistant reply: {bot_reply[:500]}"
        )
        result = _sentiment_llm.invoke([HumanMessage(content=prompt)])
        raw = result.content.strip()
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(raw)
        return TurnSentiment(**parsed)
    except Exception:
        return _DEFAULT_SENTIMENT


_SIMPLIFY_SYSTEM = (
    "You are a patient, expert special education teacher who rewrites text so "
    "neurodivergent children (ADHD, Autism, Dyslexia, Auditory Processing Disorders) "
    "can read and understand it independently.\n\n"
    "STRICT RULES — never break these:\n"
    "1. Every sentence MUST be short and declarative — {max_words} words maximum.\n"
    "2. Use only concrete, everyday vocabulary a {grade_desc} student already knows. "
    "Replace every hard word with a simpler synonym.\n"
    "3. NEVER use metaphors, idioms, sarcasm, or passive voice. "
    "Literal thinkers must understand every sentence at face value.\n"
    "4. Each sentence contains exactly ONE idea. "
    "If a sentence has two ideas, split it into two sentences.\n"
    "5. Keep the SAME meaning as the original — do not add opinions, examples, or new facts.\n"
    "6. Output ONLY the simplified plain text. No bullet points, no headings, no markdown, "
    "no numbered lists, no commentary. Just clean sentences separated by periods and spaces.\n"
    "7. When the topic changes, start a new paragraph (blank line) so the reader's eye "
    "gets a natural pause.\n"
    "8. If the original has important names, dates, or numbers, keep them exactly as-is.\n"
)

_GRADE_PROFILES: dict[str, dict[str, str | int]] = {
    "1": {"max_words": 8, "grade_desc": "1st-grade (age 6-7)"},
    "2": {"max_words": 8, "grade_desc": "2nd-grade (age 7-8)"},
    "3": {"max_words": 10, "grade_desc": "3rd-grade (age 8-9)"},
    "4": {"max_words": 10, "grade_desc": "4th-grade (age 9-10)"},
    "5": {"max_words": 12, "grade_desc": "5th-grade (age 10-11)"},
    "6": {"max_words": 12, "grade_desc": "6th-grade (age 11-12)"},
    "7": {"max_words": 15, "grade_desc": "7th-grade (age 12-13)"},
    "8": {"max_words": 15, "grade_desc": "8th-grade (age 13-14)"},
}

_DIFFICULTY_HINTS: dict[str, str] = {
    "easy": "Use the simplest possible words. Prefer one-syllable words whenever you can.",
    "medium": "Use simple words but you may include common two-syllable words.",
    "hard": "You may use grade-appropriate academic vocabulary if there is no simpler alternative.",
}


def _build_simplify_prompt(
    text: str,
    grade_level: str | None,
    reading_difficulty: str | None,
) -> list:
    profile = _GRADE_PROFILES.get(
        str(grade_level or ""), _GRADE_PROFILES["4"],
    )
    system = _SIMPLIFY_SYSTEM.format(**profile)
    diff_hint = _DIFFICULTY_HINTS.get(reading_difficulty or "", _DIFFICULTY_HINTS["medium"])
    system += f"\nAdditional vocabulary guidance: {diff_hint}\n"

    return [
        SystemMessage(content=system),
        HumanMessage(content=f"Simplify the following text:\n\n{text}"),
    ]


def _simplify_via_llm(
    text: str,
    grade_level: str | None = None,
    reading_difficulty: str | None = None,
) -> str:
    messages = _build_simplify_prompt(text, grade_level, reading_difficulty)
    result = llm.invoke(messages)
    content = result.content
    if not isinstance(content, str) or not content.strip():
        raise ValueError("LLM returned empty simplification")
    return content.strip()


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
async def upload_pdf(file: UploadFile = File(...), _user: dict = Depends(verify_user)):
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
async def simplify_text(
    text: str = Body(...),
    grade_level: str | None = Body(None),
    reading_difficulty: str | None = Body(None),
    _user: dict = Depends(verify_user),
):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text body is empty")
    try:
        simplified_text = await run_in_threadpool(
            _simplify_via_llm, text, grade_level, reading_difficulty,
        )
    except Exception:
        simplified_text = _spacy_fallback(text)
    return {"simplified_text": simplified_text}


def _spacy_fallback(text: str) -> str:
    doc = nlp(text)
    result = ""
    for sent in doc.sents:
        tokens = []
        for token in sent:
            if token.pos_ in ("NOUN", "VERB", "ADJ", "ADV"):
                tokens.append(token.lemma_)
            else:
                tokens.append(token.text)
        result += " ".join(tokens).strip() + ". "
    return result.strip()

@app.post("/add-content/")
async def add_content(text: str = Form(...), _user: dict = Depends(verify_user)):
    uid = _user.get("uid", "")
    try:
        doc_ref = db.collection("content").add({"text": text, "uid": uid})
        chunks = await run_in_threadpool(ingest, text, "manual")
        return {"id": doc_ref.id, "chunks_ingested": chunks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-content/")
async def get_content(_user: dict = Depends(verify_user)):
    uid = _user.get("uid", "")
    try:
        content = []
        docs = db.collection("content").where("uid", "==", uid).stream()
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

@app.post("/chatbot/", response_model=ChatbotResponse)
async def chatbot(
    text: str = Body(...),
    session_id: str = Body(...),
    grade_level: str | None = Body(None),
    reading_difficulty: str | None = Body(None),
    _user: dict = Depends(verify_user),
):
    input_safe, sanitized_text = _validate_input(text)
    if not input_safe:
        return ChatbotResponse(
            response=SAFE_FALLBACK,
            sentiment=_DEFAULT_SENTIMENT,
        )

    context_docs = await run_in_threadpool(
        retrieve, sanitized_text, 4, grade_level, reading_difficulty,
    )
    context = "\n\n".join(doc.page_content for doc in context_docs) if context_docs else ""
    prompt = f"Context:\n{context}\n\nQuestion: {sanitized_text}" if context else sanitized_text
    chain = _get_chain(session_id)
    llm_response = await run_in_threadpool(chain.predict, input=prompt)

    if not _validate_output(llm_response):
        return ChatbotResponse(
            response=SAFE_FALLBACK,
            sentiment=_DEFAULT_SENTIMENT,
        )

    clean_response = _sanitize_pii(llm_response)
    sentiment = await run_in_threadpool(_score_sentiment, sanitized_text, clean_response)
    return ChatbotResponse(response=clean_response, sentiment=sentiment)


@app.post("/analytics/log-quiz/")
async def log_quiz(payload: QuizResultLog, _user: dict = Depends(verify_user)):
    uid = _user.get("uid", "")
    try:
        db.collection("quiz_results").add({
            "student_id": uid,
            "score": payload.score,
            "total_questions": payload.total_questions,
            "wrong_topics": payload.wrong_topics,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "logged"}


@app.post("/analytics/log-session/")
async def log_session(payload: SessionTelemetryLog, _user: dict = Depends(verify_user)):
    uid = _user.get("uid", "")
    try:
        db.collection("telemetry_sessions").add({
            "student_id": uid,
            "session_id": payload.session_id,
            "average_focus_score": payload.average_focus_score,
            "frustration_triggers": payload.frustration_triggers,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "logged"}


@app.get("/teacher/students")
async def get_students(_user: dict = Depends(verify_role("teacher"))):
    try:
        docs = db.collection("users").where("role", "==", "student").stream()
        students = []
        for d in docs:
            data = d.to_dict()
            students.append({
                "uid": d.id,
                "email": data.get("email", ""),
                "grade_level": data.get("grade_level"),
                "reading_difficulty": data.get("reading_difficulty"),
            })
        return {"students": students}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/teacher/analytics/{student_id}")
async def get_student_analytics(student_id: str, _user: dict = Depends(verify_role("teacher"))):
    try:
        quiz_docs = (
            db.collection("quiz_results")
            .where("student_id", "==", student_id)
            .order_by("timestamp")
            .stream()
        )
        quizzes = []
        all_wrong: list[str] = []
        for d in quiz_docs:
            data = d.to_dict()
            quizzes.append({
                "score": data.get("score", 0),
                "total_questions": data.get("total_questions", 0),
                "wrong_topics": data.get("wrong_topics", []),
                "timestamp": data.get("timestamp", ""),
            })
            all_wrong.extend(data.get("wrong_topics", []))

        session_docs = (
            db.collection("telemetry_sessions")
            .where("student_id", "==", student_id)
            .order_by("timestamp")
            .stream()
        )
        sessions = []
        total_frustration = 0
        for d in session_docs:
            data = d.to_dict()
            sessions.append({
                "session_id": data.get("session_id", ""),
                "average_focus_score": data.get("average_focus_score", 0.0),
                "frustration_triggers": data.get("frustration_triggers", 0),
                "timestamp": data.get("timestamp", ""),
            })
            total_frustration += data.get("frustration_triggers", 0)

        topic_counts: dict[str, int] = {}
        for t in all_wrong:
            topic_counts[t] = topic_counts.get(t, 0) + 1

        return {
            "student_id": student_id,
            "quizzes": quizzes,
            "sessions": sessions,
            "weak_topics": topic_counts,
            "total_frustration_triggers": total_frustration,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
