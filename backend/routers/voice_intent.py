"""Voice command intent classification.

The frontend matches the common commands locally and only calls this when it
needs the LLM fallback — see services/intent.py for why rules come first.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import verify_user
from services import intent as intent_service

router = APIRouter()


class IntentRequest(BaseModel):
    text: str
    allowLlm: bool = True
    # Lets the caller say what is on screen; currently unused by the rules but
    # kept so context-sensitive disambiguation can be added without a contract change.
    context: Optional[str] = None


@router.post("/voice/intent")
async def classify_intent(req: IntentRequest, _user: dict = Depends(verify_user)):
    result = intent_service.classify(req.text, allow_llm=req.allowLlm)
    return result.to_dict()


@router.get("/voice/commands")
async def list_commands(_user: dict = Depends(verify_user)):
    """Spoken help text and the machine-readable command list.

    The same content serves the "help" voice command and any visible cheat sheet,
    so the two can never drift apart.
    """
    return {
        "spoken": intent_service.HELP_TEXT,
        "routes": intent_service.ROUTES,
    }
