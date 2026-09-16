"""Shared LLM client + a JSON-calling helper, with an automatic fallback provider.

Gemini stays primary (it's also the only one doing image description in
image_describer.py), but a text call that fails over to Groq when Groq is
configured — Gemini's free tier is 5 req/min / 20 req/day (measured against this
project's real usage, see PHASE_LEARNINGS.md Phase 2 §2.8), which is easy to
exhaust well before a class ever sees the app. Groq's free tier is far larger for
plain text completions, so it absorbs the overflow rather than the student.

One client for the whole app: chatbot, simplification, quiz generation and
teacher recommendations all route through here so the model, key, retry and
fallback behaviour live in one place.
"""

import json
import re
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from config import GEMINI_MODEL, GOOGLE_API_KEY, GROQ_API_KEY, GROQ_MODEL

llm = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    google_api_key=GOOGLE_API_KEY,
    # 4096 was enough for master's original quiz schema, but the merged schema
    # (9 questions x full disability-format fields x a full simpler-variant per
    # item) produces much bigger JSON — Gemini was hitting the cap mid-string
    # and getting silently treated as invalid JSON, falling back to spaCy.
    max_tokens=8192,
    temperature=0.3,  # low: we want consistent reformulation, not creativity
    # Default max_retries=6 means a DAILY quota 429 (which cannot succeed on
    # retry within the same day) makes the student wait 2+4+8+16+32 = 62s before
    # the fallback finally kicks in. One retry covers a genuine transient blip
    # without turning a quota exhaustion into a minute of hanging.
    max_retries=1,
)

# Same client, but with Gemini's native JSON mode turned on. Prompt-only JSON
# instructions still let the model emit prose/markdown fences or the odd
# syntax slip on a schema this large (quiz_gen's 9-question, disability-format
# + simpler-variant schema) — response_mime_type makes those structurally
# impossible instead of retrying and hoping. call_json uses this; call_text
# (chatbot, simplification, recommendations) stays on the plain `llm` above
# since those want prose, not JSON.
llm_json = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    google_api_key=GOOGLE_API_KEY,
    max_tokens=8192,
    temperature=0.3,
    max_retries=1,
    response_mime_type="application/json",
)

# Built lazily, not at import, so a missing groq package or key never breaks the
# app for everyone else — only the fallback path silently isn't available.
_groq_client: Optional[Any] = None
_groq_unavailable_reason: Optional[str] = None


def _get_groq():
    global _groq_client, _groq_unavailable_reason
    if _groq_client is not None or _groq_unavailable_reason is not None:
        return _groq_client
    if not GROQ_API_KEY:
        _groq_unavailable_reason = "GROQ_API_KEY not set"
        return None
    try:
        from groq import Groq

        _groq_client = Groq(api_key=GROQ_API_KEY, max_retries=1)
    except Exception as exc:  # noqa: BLE001
        _groq_unavailable_reason = str(exc)
        print(f"[llm] Groq fallback unavailable: {exc}")
    return _groq_client


_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class LLMUnavailable(RuntimeError):
    """Raised when NEITHER provider can be reached or returns unusable output.

    Callers are expected to fall back to the non-LLM path rather than 500 —
    a worse lesson beats no lesson.
    """


def _call_gemini(system: str, user: str) -> str:
    return llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content.strip()


def _call_gemini_json(system: str, user: str) -> str:
    return llm_json.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content.strip()


def _call_groq(system: str, user: str, json_mode: bool = False) -> str:
    client = _get_groq()
    if client is None:
        raise RuntimeError(_groq_unavailable_reason or "Groq not configured")
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.3,
        max_tokens=8192,
        # llama-3.3-70b-versatile (and most current Groq chat models) honour
        # OpenAI-style json_object mode, same structural guarantee as Gemini's
        # response_mime_type below.
        response_format={"type": "json_object"} if json_mode else None,
    )
    return (completion.choices[0].message.content or "").strip()


def call_text(system: str, user: str) -> str:
    """Gemini first, Groq on failure. Raises only if both fail (or Groq isn't
    configured and Gemini fails)."""
    try:
        return _call_gemini(system, user)
    except Exception as gemini_exc:  # noqa: BLE001
        if not GROQ_API_KEY:
            raise LLMUnavailable(str(gemini_exc)) from gemini_exc
        try:
            result = _call_groq(system, user)
            print(f"[llm] Gemini failed ({gemini_exc}); served from Groq fallback")
            return result
        except Exception as groq_exc:  # noqa: BLE001
            raise LLMUnavailable(
                f"gemini: {gemini_exc} | groq: {groq_exc}"
            ) from groq_exc


def call_json(system: str, user: str, retries: int = 1) -> Any:
    """Ask for JSON and actually get JSON.

    Uses each provider's native JSON mode (Gemini response_mime_type, Groq
    json_object) rather than prompt-only instructions — that makes "the model
    wrote prose/markdown/an unescaped-newline syntax slip" structurally
    impossible instead of something to retry and hope past. The schema itself
    (which fields, 9 questions) still isn't enforced by JSON mode, so `_valid`
    in quiz_gen.py still checks that separately; this only guarantees the
    output parses. One retry with an explicit repair instruction remains as a
    last-resort net for the rare case a response gets cut off mid-object.
    """
    prompt = user
    last_err: Optional[str] = None

    for attempt in range(retries + 1):
        try:
            raw = _call_gemini_json(system, prompt)
        except Exception as gemini_exc:  # noqa: BLE001
            if not GROQ_API_KEY:
                raise LLMUnavailable(str(gemini_exc)) from gemini_exc
            try:
                raw = _call_groq(system, prompt, json_mode=True)
                print(f"[llm] Gemini failed ({gemini_exc}); served from Groq fallback")
            except Exception as groq_exc:  # noqa: BLE001
                raise LLMUnavailable(
                    f"gemini: {gemini_exc} | groq: {groq_exc}"
                ) from groq_exc

        cleaned = _FENCE.sub("", raw).strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            last_err = f"{exc} | got: {cleaned[:200]}"
            if attempt < retries:
                prompt = (
                    f"{user}\n\nYour previous reply was not valid JSON ({exc}). "
                    "Reply with ONLY the raw JSON value. No prose, no markdown fences."
                )

    raise LLMUnavailable(f"model did not return valid JSON: {last_err}")
