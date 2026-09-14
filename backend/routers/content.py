"""Content pipeline: PDF upload, simplification, quiz generation, content CRUD.

Moved verbatim out of app.py in Phase 0.3 — behaviour is unchanged on purpose.
Phase 1 replaces the simplify and quiz logic with Gemini; this is relocation only.
"""

import io

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from PyPDF2 import PdfReader

from firebase_config import db
from services import nlp_simplify as simplifier
from services import image_describer, quiz_gen, visual_generator

router = APIRouter()


@router.post("/upload-pdf/")
async def upload_pdf(file: UploadFile = File(...), describeImages: bool = Form(False)):
    try:
        pdf_data = await file.read()
        reader = PdfReader(io.BytesIO(pdf_data))
        # extract_text() returns None on image-only pages — `or ""` stops a TypeError
        # that previously killed the whole upload.
        text = "".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {exc}")

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="No selectable text found. This PDF is probably scanned images (OCR not supported yet).",
        )

    # Opt-in: describing images costs one Gemini call each, and only blind and
    # low-vision students need it. The frontend sets this from the profile.
    images = []
    if describeImages:
        images = image_describer.describe_pdf_images(reader)

    return {"text": text, "images": images}


@router.post("/simplify-text/")
async def simplify_text(text: str = Body(..., embed=True), profile: str = Body("default", embed=True)):
    result = simplifier.simplify_text(text, profile)
    return {
        # Legacy key the current frontend reads. Keep until every caller uses `simplified`.
        "simplified_text": result["simplified"],
        **result,
    }


@router.get("/simplify-profiles/")
async def simplify_profiles():
    return {"profiles": simplifier.available_profiles()}


@router.post("/generate-quiz/")
async def generate_quiz(
    text: str = Body(..., embed=True),
    profile: str = Body("default", embed=True),
    count: int = Body(10, embed=True),
):
    return quiz_gen.generate_quiz(text, profile, max(1, min(count, 20)))


@router.post("/visual-summary/")
async def visual_summary(text: str = Body(..., embed=True), profile: str = Body("deaf", embed=True)):
    """On-demand only (roadmap 5.2) — the frontend calls this from an explicit
    "Show visual summary" button, never automatically on lesson load, since it
    is the one call in the content pipeline that isn't already free after the
    first view of a lesson."""
    return visual_generator.generate_visual_summary(text, profile)


@router.post("/add-content/")
async def add_content(text: str = Form(...)):
    if db is None:
        raise HTTPException(status_code=503, detail="Persistence unavailable")
    _, ref = db.collection("content").add({"text": text})
    return {"id": ref.id}


@router.get("/get-content/")
async def get_content():
    if db is None:
        raise HTTPException(status_code=503, detail="Persistence unavailable")
    return {
        "content": [{"id": d.id, **d.to_dict()} for d in db.collection("content").stream()]
    }
