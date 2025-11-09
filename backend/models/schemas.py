from pydantic import BaseModel
from typing import List, Optional

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

class ChatbotResponse(BaseModel):
    reply: str