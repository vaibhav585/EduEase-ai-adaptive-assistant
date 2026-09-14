"""Groq fallback self-check. Run: python test_groq_fallback.py

No network — Gemini and Groq are both mocked. Pins the three states that
matter: fallback disabled by default, fallback serves on Gemini failure when
configured, and both-fail still degrades honestly rather than hanging.
"""

import sys
from unittest.mock import MagicMock, patch

import services.llm as llm_mod


def test_no_groq_key_behaves_exactly_as_before():
    """Default .env state (GROQ_API_KEY unset): a Gemini failure must raise
    immediately, with no attempt to reach Groq — this is every deployment that
    hasn't opted in, and it must not change behaviour."""
    with patch.object(llm_mod, "GROQ_API_KEY", None), patch.object(
        llm_mod, "_call_gemini", side_effect=RuntimeError("quota")
    ), patch.object(llm_mod, "_call_groq") as groq_call:
        try:
            llm_mod.call_text("sys", "user")
            raise AssertionError("should have raised LLMUnavailable")
        except llm_mod.LLMUnavailable as exc:
            assert "quota" in str(exc)
        groq_call.assert_not_called()
    print("ok  no Groq key: fails straight to LLMUnavailable, Groq never attempted")


def test_groq_serves_when_gemini_fails():
    fake_choice = MagicMock()
    fake_choice.message.content = "groq answered this"
    fake_completion = MagicMock(choices=[fake_choice])
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_completion

    with patch.object(llm_mod, "GROQ_API_KEY", "fake-key"), patch.object(
        llm_mod, "_get_groq", return_value=fake_client
    ), patch.object(llm_mod, "_call_gemini", side_effect=RuntimeError("gemini quota exceeded")):
        result = llm_mod.call_text("sys", "user")

    assert result == "groq answered this"
    fake_client.chat.completions.create.assert_called_once()
    print("ok  Groq configured + Gemini down: request served from Groq")


def test_gemini_success_never_touches_groq():
    """Gemini succeeding must not waste a Groq call — Groq is fallback, not a
    second opinion."""
    with patch.object(llm_mod, "GROQ_API_KEY", "fake-key"), patch.object(
        llm_mod, "_call_gemini", return_value="gemini answered"
    ), patch.object(llm_mod, "_call_groq") as groq_call:
        result = llm_mod.call_text("sys", "user")
    assert result == "gemini answered"
    groq_call.assert_not_called()
    print("ok  Gemini success: Groq never called")


def test_both_providers_failing_degrades_honestly():
    with patch.object(llm_mod, "GROQ_API_KEY", "fake-key"), patch.object(
        llm_mod, "_call_gemini", side_effect=RuntimeError("gemini down")
    ), patch.object(llm_mod, "_call_groq", side_effect=RuntimeError("groq down")):
        try:
            llm_mod.call_text("sys", "user")
            raise AssertionError("should have raised LLMUnavailable")
        except llm_mod.LLMUnavailable as exc:
            assert "gemini down" in str(exc) and "groq down" in str(exc), (
                "both errors must be visible for debugging, not just the last one"
            )
    print("ok  both providers down: raises LLMUnavailable with both errors visible")


def test_call_json_uses_the_fallback_too():
    """call_json builds on call_text, so the fallback should apply transparently
    — quiz generation and simplification get it for free with no extra wiring."""
    with patch.object(llm_mod, "GROQ_API_KEY", "fake-key"), patch.object(
        llm_mod, "_call_gemini", side_effect=RuntimeError("quota")
    ), patch.object(llm_mod, "_call_groq", return_value='{"ok": true}'):
        result = llm_mod.call_json("sys", "user")
    assert result == {"ok": True}
    print("ok  call_json: fallback applies transparently through call_text")


if __name__ == "__main__":
    tests = [
        test_no_groq_key_behaves_exactly_as_before,
        test_groq_serves_when_gemini_fails,
        test_gemini_success_never_touches_groq,
        test_both_providers_failing_degrades_honestly,
        test_call_json_uses_the_fallback_too,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nGroq fallback self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
