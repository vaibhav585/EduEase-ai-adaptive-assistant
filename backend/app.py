from config import GOOGLE_API_KEY

from fastapi import FastAPI, File, UploadFile, Form, Body, Depends, HTTPException
from firebase_admin import auth as firebase_auth
from PyPDF2 import PdfReader
import io
import json
import re
from firebase_config import db
import random
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langchain_classic.chains import ConversationChain
from langchain_classic.memory import ConversationBufferMemory
from cachetools import TTLCache
import threading
from starlette.concurrency import run_in_threadpool
from ingestion import ingest, retrieve
from datetime import datetime, timezone
from models.schemas import TurnSentiment, ChatbotResponse, QuizResultLog, SessionTelemetryLog, CreateUserRequest

# Extracted to auth.py during the master/main integration so the new DASE/
# telemetry/voice routers can require the same real token verification
# without importing back into this file.
from auth import verify_user, verify_role
from services import image_describer, nlp_simplify, quiz_gen

app = FastAPI()

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


llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=GOOGLE_API_KEY,
    max_tokens=2048,
    timeout=30,
    max_retries=3,
)

_sentiment_llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
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
async def upload_pdf(
    file: UploadFile = File(...),
    describeImages: bool = Form(False),
    _user: dict = Depends(verify_user),
):
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

    # Opt-in — costs one Gemini Vision call per substantial image, only blind
    # and low-vision students need it. PdfReader is already open above, so
    # re-reading it here costs nothing extra.
    images: list[dict] = []
    if describeImages:
        images = await run_in_threadpool(image_describer.describe_pdf_images, pdf_reader)

    return {"text": text, "chunks_ingested": chunks, "images": images}

@app.post("/simplify-text/")
async def simplify_text(
    text: str = Body(...),
    profile: str = Body("default"),
    grade_level: str | None = Body(None),
    reading_difficulty: str | None = Body(None),
    _user: dict = Depends(verify_user),
):
    """Merges two axes built separately by the two source branches: grade
    level + reading difficulty (main) and disability profile (master) — see
    services/nlp_simplify.py for how they compose into one prompt."""
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text body is empty")
    result = await run_in_threadpool(
        nlp_simplify.simplify_text, text, profile, grade_level, reading_difficulty,
    )
    return {
        # Legacy key the current frontend reads. Keep until every caller uses `simplified`.
        "simplified_text": result["simplified"],
        **result,
    }


@app.get("/simplify-profiles/")
async def simplify_profiles(_user: dict = Depends(verify_user)):
    return {"profiles": nlp_simplify.available_profiles()}

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
async def generate_quiz(
    text: str = Body(..., embed=True),
    profile: str = Body("default", embed=True),
    grade_level: str | None = Body(None, embed=True),
    count: int = Body(9, embed=True),
    _user: dict = Depends(verify_user),
):
    """Merges main's 3-question-type distribution (mcq/true_false/fill_blank)
    with master's disability-adapted item formats and simpler-variant
    generation — see services/quiz_gen.py."""
    return await run_in_threadpool(
        quiz_gen.generate_quiz, text, profile, max(9, min(count, 20)), grade_level,
    )

# One-line style hints folded into the RAG prompt, not a full rewrite of the
# chatbot pipeline — the disability-profile system built for simplify/quiz
# (services/nlp_simplify.py PROFILES) is a full rewrite ruleset, too heavy to
# repeat on every chat turn. This is a lighter touch: nudge the SAME
# RAG-grounded, safety-checked, sentiment-scored answer toward the right style.
_CHAT_PROFILE_HINTS: dict[str, str] = {
    "dyslexia": "Answer in short sentences, one idea each. Avoid nested clauses.",
    "deaf": "Answer in short, literal sentences. No idioms or figurative language.",
    "autism": "Be literal and direct. No sarcasm, idioms, or rhetorical questions.",
    "adhd": "Lead with the answer in the first sentence, then explain briefly.",
    "blind": "Never reference visual layout. Spell out symbols in words.",
    "dyscalculia": "Describe any numbers in concrete, countable terms.",
    "intellectual": "Use very short sentences and the simplest common words.",
    "anxiety": "Use a calm, encouraging tone. No urgency language.",
}


@app.post("/chatbot/", response_model=ChatbotResponse)
async def chatbot(
    text: str = Body(...),
    session_id: str = Body(...),
    grade_level: str | None = Body(None),
    reading_difficulty: str | None = Body(None),
    profile: str | None = Body(None),
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
    style_hint = _CHAT_PROFILE_HINTS.get(profile or "", "")
    prompt_parts = []
    if context:
        prompt_parts.append(f"Context:\n{context}")
    if style_hint:
        prompt_parts.append(f"Style guidance: {style_hint}")
    prompt_parts.append(f"Question: {sanitized_text}")
    prompt = "\n\n".join(prompt_parts)

    try:
        chain = _get_chain(session_id)
        llm_response = await run_in_threadpool(chain.predict, input=prompt)
    except Exception as chat_err:
        err_str = str(chat_err)
        print(f"[CHATBOT ERROR] chain.predict failed: {err_str[:200]}")
        is_rate_limit = "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower()
        if is_rate_limit:
            return ChatbotResponse(
                response="I'm currently experiencing high demand. Please wait a moment and try again.",
                sentiment=_DEFAULT_SENTIMENT,
            )
        try:
            direct_result = await run_in_threadpool(llm.invoke, [HumanMessage(content=prompt)])
            llm_response = direct_result.content
        except Exception as direct_err:
            print(f"[CHATBOT ERROR] direct LLM also failed: {str(direct_err)[:200]}")
            if "429" in str(direct_err) or "quota" in str(direct_err).lower():
                return ChatbotResponse(
                    response="I'm currently experiencing high demand. Please wait a moment and try again.",
                    sentiment=_DEFAULT_SENTIMENT,
                )
            return ChatbotResponse(
                response=SAFE_FALLBACK,
                sentiment=_DEFAULT_SENTIMENT,
            )

    if not isinstance(llm_response, str) or not llm_response.strip():
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


# New from the master branch (disability-adaptive scoring): DASE evaluation,
# granular per-question telemetry (feeds DASE — distinct from this file's own
# /analytics/log-quiz and log-session, which are coarser summaries the
# original teacher dashboard still reads), voice navigation, and the
# teacher-roster-scoped DASE analytics that replaces the old
# /teacher/analytics/{id} for the new dashboard. All auth-gated, same pattern
# as every endpoint above.
from routers import analytics as dase_analytics
from routers import evaluation, telemetry, voice_intent

app.include_router(evaluation.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(voice_intent.router, prefix="/api")
app.include_router(dase_analytics.router, prefix="/api")

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
