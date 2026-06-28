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