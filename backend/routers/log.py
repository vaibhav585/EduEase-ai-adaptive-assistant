from fastapi import APIRouter, HTTPException
from models.schemas import LogEntry
import json
from config import LOG_FILE

router = APIRouter()

@router.post("/log")
async def log_event(entry: LogEntry):
    try:
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(entry.dict()) + "\n")
        return {"status": "logged"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))