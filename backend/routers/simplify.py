from fastapi import APIRouter, HTTPException
from models.schemas import TextToSimplify, SimplifiedText
from services.nlp_simplify import simplify_text

router = APIRouter()

@router.post("/simplify", response_model=SimplifiedText)
async def simplify(request: TextToSimplify):
    try:
        simplified = simplify_text(request.text)
        return SimplifiedText(original=request.text, simplified=simplified)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))