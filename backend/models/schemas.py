from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# ─────────────── content pipeline ───────────────


class TextToSimplify(BaseModel):
    text: str
    profile: Optional[str] = "default"  # disability profile, wired up in Phase 1.1


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
    message: str
    user_id: str


class ChatbotResponse(BaseModel):
    reply: str


# ─────────────── telemetry (DATA_CONTRACT.md v1) ───────────────
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
    """PHASE 3 — feeds VOICE_Q and NAV_EFF.

    Additive to DATA_CONTRACT v1, which permits new optional event types.
    """

    type: Literal["voice"] = "voice"
    transcript: str = ""
    sttConfidence: float = 0.0        # browser STT confidence, 0 when unreported
    intent: str = "UNKNOWN"
    intentSource: str = "rules"       # rules | llm | none
    intentConfidence: float = 0.0
    understood: bool = False          # intent != UNKNOWN
    repeats: int = 0                  # times the student had to repeat themselves
    actionMs: Optional[int] = None    # utterance end -> action complete (NAV_EFF)
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
