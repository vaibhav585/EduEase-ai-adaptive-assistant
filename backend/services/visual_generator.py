"""Text -> visual summary for deaf-first learning (roadmap 5.2).

Gap this fills (research doc §1): deaf learners are visual-first, and text-heavy
lessons disadvantage them specifically. Converts a lesson into a Mermaid diagram
plus a handful of icon concept cards, in ONE Gemini/Groq call — not two — so the
per-lesson cost stays a single call regardless of how much this feature grows.

Cost note (this is the expensive-looking feature in Phase 5): cached on
(text, profile) exactly like simplify/quiz-gen, so one unique lesson costs one
call ever, no matter how many students view it. The frontend fires this only
on an explicit "Show visual summary" click, not automatically on page load —
see VisualSummary.tsx.
"""

from typing import Any, Dict, List

from services.cache import get_or_compute, make_key
from services.llm import LLMUnavailable, call_json

SYSTEM = """You convert a lesson into a visual summary for a Deaf or hard-of-hearing
student who learns best visually rather than through dense text.

Produce TWO things from the lesson:

1. A Mermaid diagram (flowchart or, if the content is more about relationships
   between ideas than a sequence, a mindmap) showing the STRUCTURE of the lesson —
   the process, sequence, or how the concepts relate. Rules for the diagram:
   - Use Mermaid flowchart syntax: "flowchart TD" then "A[Label] --> B[Label]" lines.
   - Node labels must be SHORT (2-5 words), concrete, plain language — no jargon
     without a plain-language gloss in brackets, e.g. "Evaporation[Water becomes vapor]".
   - Maximum 10 nodes. A cluttered diagram defeats the purpose.
   - Only include a genuine sequence, cause/effect, or hierarchy — do not force a
     flowchart onto content that has none. If the lesson has no clear structure to
     diagram, set "diagram" to null rather than inventing false connections.
   - Node IDs must be short alphanumeric identifiers (A, B, C1, step2, ...), never
     the label text itself, and never contain spaces or punctuation.

2. Between 3 and 6 concept cards: the lesson's key ideas, each as a short title,
   a ONE-sentence plain-language explanation (max 15 words), and a single emoji
   that visually represents it. Concept cards are the fallback and the companion
   to the diagram — every lesson gets concept cards, even one with no diagram.

Return ONLY this JSON shape, nothing else:
{
  "diagram": "flowchart TD\\n  A[...] --> B[...]" or null,
  "diagramType": "flowchart" or "mindmap" or null,
  "concepts": [
    {"title": "...", "explanation": "...", "emoji": "..."}
  ]
}
"""

MAX_CHARS = 6000  # matches nlp_simplify's chunking boundary; keep one call, one summary


def _valid_node_id(node_id: str) -> bool:
    return bool(node_id) and all(c.isalnum() for c in node_id)


def _sanitize_diagram(diagram: str) -> str:
    """Reject anything that doesn't look like Mermaid flowchart syntax rather
    than rendering arbitrary text as a diagram and confusing the student."""
    lines = [ln.strip() for ln in diagram.strip().splitlines() if ln.strip()]
    if not lines or not lines[0].lower().startswith(("flowchart", "graph", "mindmap")):
        raise ValueError("diagram does not start with a recognised Mermaid directive")
    if len(lines) > 40:  # a real 10-node diagram is nowhere near this; catches runaway output
        raise ValueError("diagram implausibly long, likely malformed output")
    return "\n".join(lines)


def _normalise(raw: Dict[str, Any]) -> Dict[str, Any]:
    concepts: List[Dict[str, str]] = []
    for c in raw.get("concepts") or []:
        title = str(c.get("title") or "").strip()
        explanation = str(c.get("explanation") or "").strip()
        emoji = str(c.get("emoji") or "").strip()
        if title and explanation:
            concepts.append({"title": title, "explanation": explanation, "emoji": emoji or "\U0001F4A1"})
    concepts = concepts[:6]

    diagram = raw.get("diagram")
    diagram_type = raw.get("diagramType")
    if diagram:
        try:
            diagram = _sanitize_diagram(str(diagram))
        except ValueError as exc:
            print(f"[visual_generator] rejected malformed diagram: {exc}")
            diagram, diagram_type = None, None

    return {"diagram": diagram, "diagramType": diagram_type, "concepts": concepts}


def generate_visual_summary(text: str, profile: str = "deaf") -> Dict[str, Any]:
    """Returns the cached-or-computed visual summary. Never raises — degrades to
    an empty-but-valid shape so the frontend can fall back to text-only cleanly."""
    text = (text or "").strip()
    if not text:
        return {"diagram": None, "diagramType": None, "concepts": [], "degraded": False}

    def compute() -> Dict[str, Any]:
        raw = call_json(SYSTEM, f"Lesson:\n\n{text[:MAX_CHARS]}")
        if not isinstance(raw, dict):
            raise LLMUnavailable("model did not return a JSON object")
        return _normalise(raw)

    try:
        result = get_or_compute("visual_summary_cache", make_key(text, profile), compute)
        degraded = False
    except LLMUnavailable as exc:
        print(f"[visual_generator] LLM unavailable: {exc}")
        result, degraded = {"diagram": None, "diagramType": None, "concepts": []}, True

    return {**result, "degraded": degraded}
