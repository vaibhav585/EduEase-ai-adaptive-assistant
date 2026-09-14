"""Educational descriptions of images inside uploaded PDFs.

The gap this fills (research doc §2): vision models produce *alt-text* — "a
diagram with arrows and boxes" — which tells a blind student an image exists
without telling them what it teaches. We ask for the teaching content instead.

Images are extracted with PyPDF2's own `page.images` rather than pdf2image,
deliberately: pdf2image requires poppler installed system-wide, which is a real
setup failure on Windows. PyPDF2 is already a dependency and needs nothing extra.
"""

import base64
from typing import Any, Dict, List

from services.cache import get_or_compute, make_key
from services.llm import LLMUnavailable, llm

# Small images are almost always logos, bullets, rules and borders. Describing
# them wastes Gemini quota and buries the real content in noise.
MIN_IMAGE_BYTES = 8000
MAX_IMAGES_PER_PDF = 10

SYSTEM = """You describe images from educational material for a student who cannot see them.

Do NOT write alt-text. Write the EXPLANATION a good teacher would give.

Rules:
- Lead with what the image TEACHES, not what it depicts.
  Bad:  "A diagram with arrows between labelled boxes."
  Good: "This shows the water cycle as four stages. Water evaporates from the sea,
         forms clouds, falls as rain, and flows back to the sea."
- Read out every number, label and axis value that carries meaning.
- For a chart, state the trend and the actual figures. "Sales rose from 20 to 50
  between January and April."
- Describe spatial relationships in words, never by pointing ("on the left").
- Plain language, short sentences. This will be read aloud by a screen reader.
- If the image is decorative or carries no teaching content, reply with exactly:
  DECORATIVE
- 2 to 5 sentences. No preamble.
"""


def extract_images(pdf_reader, max_images: int = MAX_IMAGES_PER_PDF) -> List[Dict[str, Any]]:
    """Pull embedded images out of an already-open PdfReader."""
    images: List[Dict[str, Any]] = []

    for page_number, page in enumerate(pdf_reader.pages):
        if len(images) >= max_images:
            break
        try:
            for image_file in page.images:
                if len(images) >= max_images:
                    break
                data = image_file.data
                if not data or len(data) < MIN_IMAGE_BYTES:
                    continue
                images.append(
                    {
                        "page": page_number + 1,
                        "name": getattr(image_file, "name", f"img{len(images)}"),
                        "data": data,
                    }
                )
        except Exception as exc:  # noqa: BLE001
            # A malformed image must not abort the upload — the text still matters.
            print(f"[image_describer] page {page_number + 1} image extraction failed: {exc}")
            continue

    return images


def _mime_for(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:4] == b"GIF8":
        return "image/gif"
    return "image/png"


def describe_image(data: bytes) -> str:
    """One educational description. Cached on image content."""

    def compute() -> str:
        message = {
            "role": "user",
            "content": [
                {"type": "text", "text": "Explain this image for a student who cannot see it."},
                {
                    "type": "image_url",
                    "image_url": f"data:{_mime_for(data)};base64,{base64.b64encode(data).decode()}",
                },
            ],
        }
        from langchain_core.messages import SystemMessage

        try:
            return llm.invoke([SystemMessage(content=SYSTEM), message]).content.strip()
        except Exception as exc:  # noqa: BLE001
            raise LLMUnavailable(str(exc)) from exc

    return get_or_compute("image_desc_cache", make_key(base64.b64encode(data).decode()[:512]), compute)


def describe_pdf_images(pdf_reader, max_images: int = MAX_IMAGES_PER_PDF) -> List[Dict[str, Any]]:
    """Describe every substantial image in a PDF.

    Never raises: a failed description degrades that one image to a placeholder
    the UI can announce honestly, rather than losing the whole upload.
    """
    described: List[Dict[str, Any]] = []

    for image in extract_images(pdf_reader, max_images):
        try:
            description = describe_image(image["data"])
            if description.strip().upper() == "DECORATIVE":
                continue  # nothing to teach; announcing it would be noise
            described.append(
                {
                    "page": image["page"],
                    "name": image["name"],
                    "description": description,
                    "degraded": False,
                }
            )
        except LLMUnavailable as exc:
            print(f"[image_describer] description unavailable: {exc}")
            described.append(
                {
                    "page": image["page"],
                    "name": image["name"],
                    # Honest placeholder. Silently omitting the image would leave a
                    # blind student unaware that content exists which they cannot reach.
                    "description": (
                        f"There is an image on page {image['page']} that could not be "
                        "described automatically. Ask your teacher what it shows."
                    ),
                    "degraded": True,
                }
            )

    return described
