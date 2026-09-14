"""Chatbot with per-user conversation memory.

Phase 0.4 security fix: app.py previously held ONE global ConversationBufferMemory
shared by every user, so each student saw every other student's context.
"""

from collections import OrderedDict, deque

from fastapi import APIRouter, Body
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from config import GEMINI_MODEL, GOOGLE_API_KEY

router = APIRouter()

llm = ChatGoogleGenerativeAI(model=GEMINI_MODEL, google_api_key=GOOGLE_API_KEY, max_tokens=2048)

SYSTEM_PROMPT = (
    "You are EduEase, a patient tutor for students with learning disabilities. "
    "Use short sentences and plain words. Explain one idea at a time. "
    "Never use idioms or sarcasm. Be encouraging and concrete."
)

MAX_TURNS = 12  # per user, keeps the prompt bounded
MAX_USERS = 500  # LRU cap so memory can't grow without limit

_memory: "OrderedDict[str, deque]" = OrderedDict()


def _history(user_id: str) -> deque:
    if user_id in _memory:
        _memory.move_to_end(user_id)
    else:
        _memory[user_id] = deque(maxlen=MAX_TURNS * 2)
        if len(_memory) > MAX_USERS:
            _memory.popitem(last=False)
    return _memory[user_id]


@router.post("/chatbot/")
async def chat(text: str = Body(..., embed=True), user_id: str = Body("anonymous", embed=True)):
    history = _history(user_id)
    messages = [SystemMessage(content=SYSTEM_PROMPT), *history, HumanMessage(content=text)]

    reply = llm.invoke(messages).content

    history.append(HumanMessage(content=text))
    history.append(AIMessage(content=reply))
    return {"response": reply, "reply": reply}


@router.delete("/chatbot/{user_id}")
async def clear_history(user_id: str):
    _memory.pop(user_id, None)
    return {"status": "cleared"}
