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
    message: str
    user_id: str
    session_id: str

class TurnSentiment(BaseModel):
    frustration_score: float = Field(ge=0.0, le=1.0)
    suggested_action: Literal["continue", "simplify", "offer_break"]


class ChatbotResponse(BaseModel):
    reply: str
    sentiment: TurnSentiment