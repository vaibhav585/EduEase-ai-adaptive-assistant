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
from models.schemas import TurnSentiment, ChatbotResponse, QuizResultLog, SessionTelemetryLog, CreateUserRequest

app = FastAPI()
nlp = spacy.load("en_core_web_sm")

ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "admin@123"


def _ensure_user(email: str, password: str, profile: dict) -> str:
    try:
        existing = firebase_auth.get_user_by_email(email)
        uid = existing.uid
    except Exception:
        new_user = firebase_auth.create_user(email=email, password=password)
        uid = new_user.uid
    doc = db.collection("users").document(uid).get()
    if not doc.exists or doc.to_dict().get("role") != profile.get("role"):
        db.collection("users").document(uid).set(profile, merge=True)
    return uid


def _delete_collection(col_name: str):
    batch_size = 50
    while True:
        docs = list(db.collection(col_name).limit(batch_size).stream())
        if not docs:
            break
        batch = db.batch()
        for d in docs:
            batch.delete(d.reference)
        batch.commit()


def _seed_demo_data():
    try:
        admin_uid = _ensure_user(ADMIN_EMAIL, ADMIN_PASSWORD, {"email": ADMIN_EMAIL, "role": "admin"})

        teacher_uids = []
        for i in range(1, 4):
            email = f"teacher{i}@test.com"
            uid = _ensure_user(email, "teacher@123", {"email": email, "role": "teacher"})
            teacher_uids.append(uid)

        student_map: list[tuple[str, str]] = []
        for i in range(1, 11):
            email = f"student{i}@test.com"
            teacher_uid = teacher_uids[(i - 1) % len(teacher_uids)]
            grade = str(((i - 1) % 8) + 1)
            uid = _ensure_user(email, "student@123", {
                "email": email,
                "role": "student",
                "grade_level": grade,
                "teacher_id": teacher_uid,
            })
            student_map.append((uid, teacher_uid))

        existing = list(db.collection("quiz_results").limit(1).stream())
        if existing:
            print("[SEED] Clearing stale demo data...")
            _delete_collection("quiz_results")
            _delete_collection("telemetry_sessions")

        topics_pool = [
            "Cell Biology", "Photosynthesis Process", "Chemical Bonding",
            "Solar System Structure", "Water Cycle Mechanics", "Gravity & Motion",
            "Plant Anatomy", "Ecosystem Dynamics", "Light & Optics",
            "Human Anatomy", "Computer Memory Architecture",
            "Object-Oriented Programming", "Control Flow Structures",
        ]
        now = datetime.now(timezone.utc)
        for sid, tid in student_map:
            for q in range(5):
                score = random.randint(4, 10)
                wrong = random.sample(topics_pool, k=random.randint(0, 3))
                ts = now.replace(hour=10 + q, minute=0, second=0, microsecond=0)
                ts = ts.replace(day=max(1, ts.day - (4 - q)))
                db.collection("quiz_results").add({
                    "student_id": sid,
                    "teacher_id": tid,
                    "score": score,
                    "total_questions": 10,
                    "wrong_topics": wrong,
                    "timestamp": ts.isoformat(),
                })

            for s in range(5):
                focus = round(0.5 + random.random() * 0.45, 2)
                triggers = random.randint(0, 4)
                ts = now.replace(hour=9 + s, minute=30, second=0, microsecond=0)
                ts = ts.replace(day=max(1, ts.day - (4 - s)))
                db.collection("telemetry_sessions").add({
                    "student_id": sid,
                    "teacher_id": tid,
                    "session_id": f"seed-{sid[:6]}-{s}",
                    "average_focus_score": focus,
                    "frustration_triggers": triggers,
                    "timestamp": ts.isoformat(),
                })

        print(f"[SEED] Seeded {len(student_map)} students, {len(teacher_uids)} teachers, 50 quiz + 50 session records")

    except Exception as e:
        print(f"[WARN] Seed skipped: {e}")


_seed_demo_data()

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

_QUIZ_SYSTEM_PROMPT = (
    "You are an educational quiz generator. Given a passage of text, generate quiz questions.\n"
    "Output ONLY a valid JSON array. No markdown, no explanation.\n"
    "Each element MUST have exactly these keys:\n"
    '  "question": the question string\n'
    '  "options": array of 4 answer choices (for fill_blank and mcq) or ["True","False"] for true_false\n'
    '  "answer": the correct option string (must match one element in options exactly)\n'
    '  "question_type": one of "fill_blank", "true_false", "mcq"\n'
    '  "topic": a broad educational domain header (2-5 words) like "Cell Biology", '
    '"Computer Memory Architecture", "Photosynthesis Process", "Gravity & Motion". '
    "NEVER quote raw words from the text. Always use a standardized academic category name.\n\n"
    "Generate a balanced mix of all three question types.\n"
    "Generate at most 10 questions.\n"
)


def _generate_quiz_via_llm(text: str) -> list[dict]:
    prompt = f"{_QUIZ_SYSTEM_PROMPT}\nPassage:\n{text[:3000]}"
    result = llm.invoke([HumanMessage(content=prompt)])
    raw = result.content.strip()
    raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    questions = json.loads(raw)
    if not isinstance(questions, list):
        return []
    valid = []
    for q in questions:
        if all(k in q for k in ("question", "options", "answer", "question_type", "topic")):
            if isinstance(q["options"], list) and q["answer"] in q["options"]:
                valid.append(q)
    return valid


def _generate_quiz_spacy_fallback(text: str) -> list[dict]:
    doc = nlp(text)
    questions: list[dict] = []
    all_words = [t.text for t in doc if t.pos_ in ("NOUN", "VERB", "ADJ")]
    for i, sent in enumerate(s for s in doc.sents if len(s.text.split()) > 5):
        blanks = [t.text for t in sent if t.pos_ in ("NOUN", "VERB", "ADJ")]
        if not blanks:
            continue
        blank = random.choice(blanks)
        question_text = sent.text.replace(blank, "______")
        options = [blank]
        distractors = [w for w in all_words if w != blank]
        random.shuffle(distractors)
        for _ in range(3):
            options.append(distractors.pop() if distractors else f"Option {len(options)}")
        random.shuffle(options)
        chunks = [c.text.title() for c in nlp(sent.text).noun_chunks if len(c.text.split()) >= 2]
        topic = chunks[0] if chunks else "General Knowledge"
        questions.append({
            "question": question_text, "options": options, "answer": blank,
            "question_type": "fill_blank", "topic": topic,
        })
    return questions


@app.post("/generate-quiz/")
async def generate_quiz(text: str = Body(..., embed=True), _user: dict = Depends(verify_user)):
    try:
        questions = await run_in_threadpool(_generate_quiz_via_llm, text)
    except Exception:
        questions = []
    if not questions:
        try:
            questions = _generate_quiz_spacy_fallback(text)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error generating quiz: {e}")
    return {"questions": questions}

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

    try:
        context_docs = await run_in_threadpool(
            retrieve, sanitized_text, 4, grade_level, reading_difficulty,
        )
    except Exception:
        context_docs = []

    context = "\n\n".join(doc.page_content for doc in context_docs) if context_docs else ""
    prompt = f"Context:\n{context}\n\nQuestion: {sanitized_text}" if context else sanitized_text

    try:
        chain = _get_chain(session_id)
        llm_response = await run_in_threadpool(chain.predict, input=prompt)
    except Exception:
        return ChatbotResponse(
            response=SAFE_FALLBACK,
            sentiment=_DEFAULT_SENTIMENT,
        )

    if not _validate_output(llm_response):
        return ChatbotResponse(
            response=SAFE_FALLBACK,
            sentiment=_DEFAULT_SENTIMENT,
        )

    clean_response = _sanitize_pii(llm_response)
    sentiment = await run_in_threadpool(_score_sentiment, sanitized_text, clean_response)
    return ChatbotResponse(response=clean_response, sentiment=sentiment)


def _get_teacher_id(student_uid: str) -> str | None:
    try:
        snap = db.collection("users").document(student_uid).get()
        if snap.exists:
            return snap.to_dict().get("teacher_id")
    except Exception:
        pass
    return None


@app.post("/analytics/log-quiz/")
async def log_quiz(payload: QuizResultLog, _user: dict = Depends(verify_user)):
    uid = _user.get("uid", "")
    teacher_id = await run_in_threadpool(_get_teacher_id, uid)
    try:
        entry: dict = {
            "student_id": uid,
            "score": payload.score,
            "total_questions": payload.total_questions,
            "wrong_topics": payload.wrong_topics,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if teacher_id:
            entry["teacher_id"] = teacher_id
        db.collection("quiz_results").add(entry)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "logged"}


@app.post("/analytics/log-session/")
async def log_session(payload: SessionTelemetryLog, _user: dict = Depends(verify_user)):
    uid = _user.get("uid", "")
    teacher_id = await run_in_threadpool(_get_teacher_id, uid)
    try:
        entry: dict = {
            "student_id": uid,
            "session_id": payload.session_id,
            "average_focus_score": payload.average_focus_score,
            "frustration_triggers": payload.frustration_triggers,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if teacher_id:
            entry["teacher_id"] = teacher_id
        db.collection("telemetry_sessions").add(entry)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "logged"}


@app.post("/admin/create-user")
async def admin_create_user(payload: CreateUserRequest, _user: dict = Depends(verify_role("admin"))):
    try:
        new_user = firebase_auth.create_user(email=payload.email, password=payload.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Firebase user creation failed: {e}")
    try:
        user_data: dict = {"email": payload.email, "role": payload.role}
        if payload.grade_level:
            user_data["grade_level"] = payload.grade_level
        if payload.teacher_id:
            user_data["teacher_id"] = payload.teacher_id
        db.collection("users").document(new_user.uid).set(user_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Firestore profile write failed: {e}")
    return {"uid": new_user.uid, "email": payload.email, "role": payload.role}


@app.get("/admin/users")
async def admin_list_users(_user: dict = Depends(verify_role("admin"))):
    try:
        docs = db.collection("users").stream()
        users = []
        for d in docs:
            data = d.to_dict()
            users.append({
                "uid": d.id,
                "email": data.get("email", ""),
                "role": data.get("role", ""),
                "grade_level": data.get("grade_level"),
                "teacher_id": data.get("teacher_id"),
            })
        return {"users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/teacher/students")
async def get_students(_user: dict = Depends(verify_role("teacher"))):
    teacher_uid = _user.get("uid", "")
    try:
        docs = (
            db.collection("users")
            .where("role", "==", "student")
            .where("teacher_id", "==", teacher_uid)
            .stream()
        )
        students = []
        for d in docs:
            data = d.to_dict()
            students.append({
                "uid": d.id,
                "email": data.get("email", ""),
                "grade_level": data.get("grade_level"),
            })
        return {"students": students}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/teacher/analytics/{student_id}")
async def get_student_analytics(student_id: str, _user: dict = Depends(verify_role("teacher"))):
    import traceback
    try:
        quiz_docs = (
            db.collection("quiz_results")
            .where("student_id", "==", student_id)
            .stream()
        )
        quizzes = []
        all_wrong: list[str] = []
        for d in quiz_docs:
            data = d.to_dict()
            score = data.get("score", 0)
            total = data.get("total_questions", 0)
            wrong = data.get("wrong_topics") or []
            ts = data.get("timestamp", "")
            if not isinstance(score, (int, float)):
                score = 0
            if not isinstance(total, (int, float)):
                total = 0
            quizzes.append({
                "score": int(score),
                "total_questions": int(total),
                "wrong_topics": wrong if isinstance(wrong, list) else [],
                "timestamp": str(ts),
            })
            if isinstance(wrong, list):
                all_wrong.extend(wrong)
        quizzes.sort(key=lambda q: q["timestamp"])

        session_docs = (
            db.collection("telemetry_sessions")
            .where("student_id", "==", student_id)
            .stream()
        )
        sessions = []
        total_frustration = 0
        for d in session_docs:
            data = d.to_dict()
            focus = data.get("average_focus_score", 0.0)
            triggers = data.get("frustration_triggers", 0)
            ts = data.get("timestamp", "")
            if not isinstance(focus, (int, float)):
                focus = 0.0
            if not isinstance(triggers, (int, float)):
                triggers = 0
            sessions.append({
                "session_id": str(data.get("session_id", "")),
                "average_focus_score": float(focus),
                "frustration_triggers": int(triggers),
                "timestamp": str(ts),
            })
            total_frustration += int(triggers)
        sessions.sort(key=lambda s: s["timestamp"])

        topic_counts: dict[str, int] = {}
        for t in all_wrong:
            if isinstance(t, str) and t:
                topic_counts[t] = topic_counts.get(t, 0) + 1

        return {
            "student_id": student_id,
            "quizzes": quizzes,
            "sessions": sessions,
            "weak_topics": topic_counts,
            "total_frustration_triggers": total_frustration,
        }
    except Exception as e:
        traceback.print_exc()
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
