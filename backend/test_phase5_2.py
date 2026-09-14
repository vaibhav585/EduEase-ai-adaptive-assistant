"""Phase 5.2 self-check — visual summary generator. Run: python test_phase5_2.py

Backend logic tested directly (LLM mocked). Frontend wiring (on-demand trigger,
lazy-loading) checked statically, same pattern as test_phase5.py — no frontend
test runner exists in this repo.
"""

import sys
from pathlib import Path
from unittest.mock import patch

from services import visual_generator as vg

FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "src"


def test_route_mounted():
    import app

    paths = {r.path for r in app.app.routes}
    assert "/api/visual-summary/" in paths, "/api/visual-summary/ not mounted"
    print("ok  route: /api/visual-summary/ mounted")


def test_empty_text_short_circuits_without_calling_llm():
    with patch.object(vg, "get_or_compute") as mock_compute:
        result = vg.generate_visual_summary("", "deaf")
    mock_compute.assert_not_called()
    assert result == {"diagram": None, "diagramType": None, "concepts": [], "degraded": False}
    print("ok  empty text: no LLM call, valid empty shape returned")


def test_valid_diagram_survives_sanitization():
    # _sanitize_diagram strips each line's leading whitespace by design (it
    # rebuilds from split lines) — assert content survives, not byte-exact
    # indentation, which the function never promises to preserve.
    good = "flowchart TD\n  A[Evaporation] --> B[Condensation]\n  B --> C[Precipitation]"
    result = vg._sanitize_diagram(good)
    assert result.startswith("flowchart TD")
    assert "A[Evaporation] --> B[Condensation]" in result
    assert "B --> C[Precipitation]" in result
    print("ok  sanitize: valid flowchart passes through with content intact")


def test_malformed_diagram_is_rejected_not_rendered_as_garbage():
    """A diagram that doesn't start with a Mermaid directive would render as
    broken or nothing in the browser — better to degrade to concept-cards-only
    than show a deaf student a visibly broken diagram."""
    for bad in [
        "Here is a diagram:\nA --> B",  # prose preamble, not a directive
        "flowchart TD\n" + "\n".join(f"n{i} --> n{i+1}" for i in range(60)),  # runaway length
        "",
    ]:
        try:
            vg._sanitize_diagram(bad)
            raise AssertionError(f"should have rejected: {bad[:50]!r}")
        except ValueError:
            pass
    print("ok  sanitize: rejects missing directive and implausible length")


def test_normalise_drops_diagram_on_sanitize_failure_but_keeps_concepts():
    raw = {
        "diagram": "not a real diagram at all",
        "diagramType": "flowchart",
        "concepts": [{"title": "Evaporation", "explanation": "Water becomes vapor.", "emoji": "\U0001F4A7"}],
    }
    result = vg._normalise(raw)
    assert result["diagram"] is None, "malformed diagram must be dropped, not passed through"
    assert result["diagramType"] is None
    assert len(result["concepts"]) == 1, "concepts must survive even when the diagram is rejected"
    print("ok  normalise: bad diagram dropped, good concepts kept")


def test_normalise_drops_incomplete_concepts_and_caps_at_six():
    raw = {
        "diagram": None,
        "concepts": [
            {"title": "A", "explanation": "", "emoji": "1"},  # missing explanation -> dropped
            {"title": "", "explanation": "x", "emoji": "2"},  # missing title -> dropped
            *[{"title": f"T{i}", "explanation": f"E{i}", "emoji": ""} for i in range(8)],
        ],
    }
    result = vg._normalise(raw)
    assert len(result["concepts"]) == 6, f"expected cap of 6, got {len(result['concepts'])}"
    assert all(c["title"] and c["explanation"] for c in result["concepts"])
    assert all(c["emoji"] for c in result["concepts"]), "missing emoji must get a fallback, not blank"
    print("ok  normalise: drops incomplete concepts, caps at 6, fallback emoji applied")


def test_cached_on_text_and_profile_one_call_per_unique_lesson():
    """The whole cost argument for shipping this on-demand rests on this: one
    unique (text, profile) pair costs exactly one LLM call, ever.

    Patches cache.db to None so this only exercises the in-memory layer —
    without it, a real Firestore instance persists the write across separate
    runs of this test file, and a second run finds yesterday's cache entry and
    never calls the fake at all (0 calls, matching the cached shape) rather
    than genuinely re-verifying the cache-hit behaviour. Same pattern as
    test_phase1.py's test_cache_computes_once.
    """
    calls = []

    def fake_call_json(system, user):
        calls.append(user)
        return {"diagram": None, "concepts": [{"title": "X", "explanation": "Y", "emoji": "Z"}]}

    from services import cache

    # A unique-per-run string, so a previous run's real Firestore write (if
    # this test somehow ran once before this fix landed) can't be mistaken
    # for the fake being cache-hit this run either.
    text = f"The water cycle moves water through stages. run={id(calls)}"

    with patch.object(vg, "call_json", side_effect=fake_call_json), patch.object(cache, "db", None):
        cache.clear_memory()
        vg.generate_visual_summary(text, "deaf")
        vg.generate_visual_summary(text, "deaf")

    assert len(calls) == 1, f"same (text, profile) must hit cache on the 2nd call, got {len(calls)} LLM calls"
    print("ok  caching: identical (text, profile) triggers exactly one LLM call")


def test_llm_failure_degrades_to_valid_empty_shape():
    from services.llm import LLMUnavailable

    with patch.object(vg, "get_or_compute", side_effect=LLMUnavailable("quota")):
        result = vg.generate_visual_summary("Some lesson text here.", "deaf")
    assert result["degraded"] is True
    assert result["diagram"] is None and result["concepts"] == []
    print("ok  LLM failure: degrades to a valid empty shape, never raises to the caller")


def test_frontend_fires_on_demand_not_automatically():
    """The whole point of this phase, per the user's explicit decision: the
    diagram must be button-triggered, never generated on page load."""
    page = (FRONTEND / "pages" / "LearningPage.tsx").read_text(encoding="utf-8")
    assert "VisualSummary" in page, "VisualSummary not used in LearningPage"
    # It must be conditionally rendered behind a profile check, and the
    # component itself gates the network call behind a button (see
    # VisualSummary.tsx's own initial-render branch) rather than firing a
    # useEffect on mount.
    summary = (FRONTEND / "components" / "VisualSummary.tsx").read_text(encoding="utf-8")
    assert "useEffect(() => {\n    if (!text" not in summary, (
        "must not auto-fetch on mount via a text-triggered useEffect"
    )
    assert "onClick={() => void fetchSummary()}" in summary, (
        "the fetch must be wired to an explicit click, not an effect"
    )
    print("ok  frontend: visual summary is button-triggered, not automatic on load")


def test_visual_summary_is_lazy_loaded():
    """Mermaid pulls in several hundred KB of diagram-renderer code. A static
    import would ship that to every single user on every page load, not just
    deaf/hoh students who see the button — measured regression: 1.24MB -> 1.91MB
    on the main bundle. Must stay React.lazy()."""
    page = (FRONTEND / "pages" / "LearningPage.tsx").read_text(encoding="utf-8")
    assert "React.lazy(() => import('../components/VisualSummary'))" in page, (
        "VisualSummary must be lazy-loaded, not statically imported"
    )
    assert "import VisualSummary from '../components/VisualSummary';" not in page, (
        "a static default import would defeat the lazy() call above"
    )
    print("ok  frontend: VisualSummary is lazy-loaded (bundle-size regression avoided)")


def test_gated_to_deaf_and_hard_of_hearing_profiles():
    page = (FRONTEND / "pages" / "LearningPage.tsx").read_text(encoding="utf-8")
    assert "isDeafOrHoh" in page
    assert "'deaf'" in page and "'hard_of_hearing'" in page
    print("ok  frontend: visual summary gated to deaf/hard_of_hearing profiles")


if __name__ == "__main__":
    tests = [
        test_route_mounted,
        test_empty_text_short_circuits_without_calling_llm,
        test_valid_diagram_survives_sanitization,
        test_malformed_diagram_is_rejected_not_rendered_as_garbage,
        test_normalise_drops_diagram_on_sanitize_failure_but_keeps_concepts,
        test_normalise_drops_incomplete_concepts_and_caps_at_six,
        test_cached_on_text_and_profile_one_call_per_unique_lesson,
        test_llm_failure_degrades_to_valid_empty_shape,
        test_frontend_fires_on_demand_not_automatically,
        test_visual_summary_is_lazy_loaded,
        test_gated_to_deaf_and_hard_of_hearing_profiles,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 5.2 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
