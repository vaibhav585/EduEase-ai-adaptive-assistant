from fastapi import APIRouter, HTTPException
from models.schemas import ChatbotRequest, ChatbotResponse

router = APIRouter()

@router.post("/chatbot", response_model=ChatbotResponse)
async def chat(request: ChatbotRequest):
    # Placeholder for chatbot logic
    return ChatbotResponse(reply="This is a placeholder response from the chatbot.")