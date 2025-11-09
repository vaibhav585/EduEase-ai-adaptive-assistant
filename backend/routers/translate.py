from fastapi import APIRouter, HTTPException
from models.schemas import TranslateRequest, TranslateResponse
from services.translate_service import translate_text

router = APIRouter()

@router.post("/translate", response_model=TranslateResponse)
async def translate(request: TranslateRequest):
    try:
        translated = translate_text(request.text, request.target_lang)
        return TranslateResponse(translated_text=translated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))