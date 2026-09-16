from pydantic import BaseModel, Field
from typing import List, Literal, Optional

class TextToSimplify(BaseModel):
    text: str
    model: Optional[str] = "default"

class SimplifiedText(BaseModel):
    original: str
    simplified: str

class RecommendRequest(BaseModel):
    text: str
    user_id: str

class LogEntry(BaseModel):
    user_id: str
    action: str
    details: dict

class TranslateRequest(BaseModel):
    text: str
    target_lang: str

class TranslateResponse(BaseModel):
    translated_text: str

class ChatbotRequest(BaseModel):
    text: str
    session_id: str
    grade_level: Optional[str] = None
    reading_difficulty: Optional[str] = None

class TurnSentiment(BaseModel):
    frustration_score: float = Field(ge=0.0, le=1.0)
    suggested_action: Literal["continue", "simplify", "offer_break"]


class ChatbotResponse(BaseModel):
    response: str
    sentiment: TurnSentiment


class QuizResultLog(BaseModel):
    score: int = Field(ge=0)
    total_questions: int = Field(ge=1)
    wrong_topics: List[str] = Field(default_factory=list)


class SessionTelemetryLog(BaseModel):
    session_id: str
    average_focus_score: float = Field(ge=0.0, le=1.0)
    frustration_triggers: int = Field(ge=0)


class CreateUserRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    role: Literal["student", "teacher"]
    grade_level: Optional[str] = None
    teacher_id: Optional[str] = None


# ─────────────── telemetry (DATA_CONTRACT.md v1, from master) ───────────────
# Field names here are FROZEN. See DATA_CONTRACT.md before changing anything.


class EventBase(BaseModel):
    sessionId: str
    studentId: str
    ts: int  # client clock, ordering within a burst only


class QuestionEvent(EventBase):
    type: Literal["question"] = "question"
    questionId: str
    conceptId: Optional[str] = None
    topic: Optional[str] = None
    difficulty: int = Field(default=3, ge=1, le=5)
    questionType: str = "mcq"

    selected: Optional[str] = None
    correct: bool
    timeMs: int
    timeToFirstInteractionMs: Optional[int] = None

    attempts: int = 1
    answerChanges: int = 0
    hintsUsed: int = 0
    revisits: int = 0
    reRead: bool = False

    focusRatio: Optional[float] = None
    focusSamples: int = 0

    isRepresentation: bool = False
    originalQuestionId: Optional[str] = None


class ReadingEvent(EventBase):
    type: Literal["reading"] = "reading"
    contentId: Optional[str] = None
    wordsRead: int = 0
    wpmSetting: int = 200
    elapsedMs: int = 0
    replays: int = 0
    ttsUsed: bool = False
    pauseCount: int = 0
    focusRatio: Optional[float] = None
    focusSamples: int = 0
    simplifyProfile: str = "default"


class VoiceEvent(EventBase):
    """PHASE 3 — feeds VOICE_Q and NAV_EFF."""

    type: Literal["voice"] = "voice"
    transcript: str = ""
    sttConfidence: float = 0.0
    intent: str = "UNKNOWN"
    intentSource: str = "rules"
    intentConfidence: float = 0.0
    understood: bool = False
    repeats: int = 0
    actionMs: Optional[int] = None
    route: Optional[str] = None


class EventBatch(BaseModel):
    events: List[dict] = Field(default_factory=list, max_length=100)


class SessionStart(BaseModel):
    studentId: str
    kind: Literal["quiz", "reading"]
    contentId: Optional[str] = None


class SessionSummary(BaseModel):
    totalQuestions: int = 0
    correct: int = 0
    totalTimeMs: int = 0
    completed: bool = False
    meanFocusRatio: Optional[float] = None


class SessionEnd(BaseModel):
    summary: SessionSummary