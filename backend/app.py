"""EduEase API — wiring only.

Phase 0.3: handlers moved into routers/. Each router is mounted TWICE —
once at the root (legacy paths the current frontend calls) and once under /api
(the shape everything new uses). The legacy mount goes away once every caller
has migrated; until then, removing it breaks the app.
"""

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from routers import analytics, chatbot, content, evaluation, health, telemetry, voice_intent

app = FastAPI(title="EduEase API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Welcome to the AI-Powered Easy-Learning Application"}


# Legacy root mounts — /upload-pdf/, /simplify-text/, /generate-quiz/, /chatbot/
app.include_router(content.router, tags=["content (legacy)"])
app.include_router(chatbot.router, tags=["chatbot (legacy)"])

# Canonical /api mounts
app.include_router(content.router, prefix="/api", tags=["content"])
app.include_router(chatbot.router, prefix="/api", tags=["chatbot"])
app.include_router(telemetry.router, prefix="/api", tags=["telemetry"])
app.include_router(evaluation.router, prefix="/api", tags=["evaluation"])
app.include_router(voice_intent.router, prefix="/api", tags=["voice"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])
app.include_router(health.router, prefix="/api", tags=["health"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
