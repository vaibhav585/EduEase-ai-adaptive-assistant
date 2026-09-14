"""Phase 2 self-check — DASE + error classification. Run: python test_phase2.py

Pure computation, no network, no LLM. These are the tests that matter most in the
project: they guard the novelty claim.
"""

import sys

from services import dase_engine as dase
from services.dase_engine import (
    ATTENTION_LAPSE,
    COMPREHENSION_BARRIER,
    KNOWLEDGE_GAP,
    PROCESSING_DELAY,
)

# A settled personal baseline of 10s per question.
BASELINE = [10000] * 8


def _event(**kw):
    base = {
        "type": "question",
        "correct": False,
        "selected": "x",
        "timeMs": 10000,
        "difficulty": 3,
        "answerChanges": 0,
        "focusRatio": None,
        "focusSamples": 0,
        "reRead": False,
        "revisits": 0,
    }
    base.update(kw)
    return base


# ─────────────── error classification ───────────────


def test_processing_delay():
    """Long time on task, still wrong -> ran out of processing capacity, not attention."""
    r = dase.classify_error(time_ms=35000, prior_times_ms=BASELINE, answer_changes=2)
    assert r.label == PROCESSING_DELAY, r.label
    assert r.confidence > 0.5

    timed_out = dase.classify_error(time_ms=60000, prior_times_ms=BASELINE, timed_out=True)
    assert timed_out.label == PROCESSING_DELAY and timed_out.confidence >= 0.9
    print("ok  PROCESSING_DELAY: slow answers and timeouts")


def test_attention_lapse_needs_focus_evidence():
    """Fast + wrong + looking away -> lapse."""
    r = dase.classify_error(
        time_ms=3000, prior_times_ms=BASELINE, focus_ratio=0.2, focus_samples=20
    )
    assert r.label == ATTENTION_LAPSE, r.label
    assert r.confidence > 0.3
    print("ok  ATTENTION_LAPSE: fast + wrong + distracted")


def test_comprehension_barrier_needs_present_and_fast():
    """Fast + wrong + present and looking + never re-read -> the question didn't land."""
    r = dase.classify_error(
        time_ms=2000, prior_times_ms=BASELINE, focus_ratio=0.95, focus_samples=20, re_read=False
    )
    assert r.label == COMPREHENSION_BARRIER, r.label
    assert dase.should_represent(r), "a confident barrier must trigger re-presentation"

    # Re-reading the stem means they DID engage with the wording — not a barrier.
    reread = dase.classify_error(
        time_ms=2000, prior_times_ms=BASELINE, focus_ratio=0.95, focus_samples=20, re_read=True
    )
    assert reread.label != COMPREHENSION_BARRIER
    print("ok  COMPREHENSION_BARRIER: fast + present + no re-read; re-read excludes it")


def test_ambiguity_is_admitted_not_invented():
    """THE honesty test.

    ATTENTION_LAPSE and COMPREHENSION_BARRIER are both 'fast and wrong', separated
    only by the webcam signal. With no focus data we must NOT pick one — guessing
    would manufacture a research finding out of nothing.
    """
    r = dase.classify_error(time_ms=2000, prior_times_ms=BASELINE, focus_ratio=None)
    assert r.label == KNOWLEDGE_GAP, "must fall back, not guess"
    assert r.confidence <= 0.35, "a fallback must not look confident"
    assert ATTENTION_LAPSE in r.alternatives and COMPREHENSION_BARRIER in r.alternatives, (
        "the ambiguity must be recorded, not hidden"
    )

    # Thin focus data is treated as no focus data (contract §3.1: <5 samples).
    thin = dase.classify_error(
        time_ms=2000, prior_times_ms=BASELINE, focus_ratio=0.1, focus_samples=2
    )
    assert thin.label == KNOWLEDGE_GAP, "2 focus samples must not drive a classification"
    print("ok  ambiguity: falls back to KNOWLEDGE_GAP, records alternatives, low confidence")


def test_baseline_is_personal_not_cohort():
    """The same 3s answer means different things for a fast vs a slow student.

    This is the core correction to the original plan: a cohort median is the
    neurotypical baseline the research warns against.
    """
    fast_student = dase.classify_error(
        time_ms=3000, prior_times_ms=[3000] * 8, focus_ratio=0.95, focus_samples=20
    )
    slow_student = dase.classify_error(
        time_ms=3000, prior_times_ms=[30000] * 8, focus_ratio=0.95, focus_samples=20
    )
    assert fast_student.label == KNOWLEDGE_GAP, "3s is NORMAL for this student"
    assert slow_student.label == COMPREHENSION_BARRIER, "3s is a red flag for this student"
    print("ok  baseline: identical timing classified differently per student")


def test_confidence_scales_with_evidence():
    """A new student with no baseline must not produce confident classifications."""
    no_history = dase.classify_error(
        time_ms=2000, prior_times_ms=[], focus_ratio=0.95, focus_samples=20
    )
    settled = dase.classify_error(
        time_ms=2000, prior_times_ms=BASELINE, focus_ratio=0.95, focus_samples=20
    )
    assert no_history.confidence < settled.confidence, (
        "confidence must rise with baseline evidence"
    )
    print(f"ok  confidence: no-baseline {no_history.confidence:.2f} < settled {settled.confidence:.2f}")


# ─────────────── DASE scoring ───────────────


def test_missing_parameters_are_absent_not_zero():
    """A parameter with no data must be omitted and weights renormalized.

    Scoring it as 0 would read as 'the student scored zero' and would silently
    drag the composite down.
    """
    params = {"ACC": 0.8, "EFFORT": 0.9}
    result = dase.compute_dase(params, "blind")

    assert "VOICE_Q" in result["missingParameters"], "Phase 3 params must be reported missing"
    assert set(result["usedWeights"]) <= set(params), "must not weight absent params"
    assert abs(sum(result["usedWeights"].values()) - 1.0) < 1e-6, "weights must renormalize to 1"
    assert result["coverage"] < 1.0, "coverage must reflect what is actually measured"
    assert 0.8 <= result["score"] <= 0.9
    print(f"ok  missing params: omitted, renormalized, coverage={result['coverage']}")


def test_profiles_rank_the_same_student_differently():
    """THE ablation test — the evidence that disability-conditional weighting does
    anything at all. If every profile returns the same score, the novelty claim is
    empty."""
    # A student with poor raw accuracy but strong effort and improvement:
    # the archetype the whole project exists for.
    params = {
        "ACC": 0.40,
        "ADJ_ACC": 0.62,
        "COMP": 0.50,
        "EFFORT": 0.90,
        "LRN_VEL": 0.85,
        "TIME_EFF": 0.30,
        "CONSIST": 0.70,
        "TASK_COMP": 1.0,
        "ATT_SPAN": 0.45,
        "READ_FL": 0.60,
    }
    scores = {
        p: dase.compute_dase(params, p)["score"]
        for p in ["default", "adhd", "dyslexia", "autism", "anxiety", "intellectual"]
    }
    spread = max(scores.values()) - min(scores.values())
    assert spread > 0.08, f"profiles barely differ ({spread:.3f}) — weighting is doing nothing"
    assert scores["intellectual"] > scores["default"], (
        "effort/velocity-weighted profile must reward this student more than the default"
    )
    assert scores["anxiety"] > scores["default"], "anxiety profile de-emphasizes raw accuracy"
    print(f"ok  ablation: spread={spread:.3f}  " + "  ".join(f"{k}={v:.3f}" for k, v in scores.items()))


def test_adj_acc_uses_confidence_not_binary_label():
    """A low-confidence lapse must barely move the score (roadmap §2.3)."""
    def build(conf):
        return [
            _event(correct=True),
            _event(correct=True),
            _event(
                correct=False,
                classification={"label": ATTENTION_LAPSE, "confidence": conf},
            ),
            _event(correct=False, classification={"label": KNOWLEDGE_GAP, "confidence": 0.8}),
        ]

    low = dase.compute_parameters(build(0.1))["ADJ_ACC"]
    high = dase.compute_parameters(build(0.9))["ADJ_ACC"]
    acc = dase.compute_parameters(build(0.9))["ACC"]

    assert acc == 0.5
    assert low < high, "confidence must modulate the credit"
    assert high - low > 0.1, "confidence must have real effect"
    assert high <= 0.7, "credit is partial, never full"
    assert low - acc < 0.05, "a 0.1-confidence lapse must barely shift the score"
    print(f"ok  ADJ_ACC: acc={acc}  low-conf={low:.3f}  high-conf={high:.3f}")


def test_parameters_from_realistic_session():
    events = [
        _event(correct=True, timeMs=9000, difficulty=2),
        _event(correct=False, timeMs=3000, difficulty=4, answerChanges=1),
        _event(correct=True, timeMs=11000, difficulty=3, reRead=True),
        _event(correct=True, timeMs=10000, difficulty=4),
        _event(correct=False, timeMs=25000, difficulty=5),
        _event(correct=True, timeMs=8000, difficulty=3),
        _event(correct=True, timeMs=9500, difficulty=4),
        _event(correct=True, timeMs=9000, difficulty=2),
    ]
    params = dase.compute_parameters(
        events,
        reading_events=[{"wordsRead": 400, "elapsedMs": 120000}],
        sessions=[{"summary": {"completed": True}}, {"summary": {"completed": False}}],
    )

    assert params["ACC"] == 0.75
    assert "COMP" in params and "CONSIST" in params and "EFFORT" in params
    assert params["TASK_COMP"] == 0.5
    assert 0 < params["READ_FL"] <= 1
    assert "ATT_SPAN" not in params, "no webcam data -> parameter must be absent entirely"
    assert all(0.0 <= v <= 1.0 for v in params.values()), f"parameters out of range: {params}"
    print(f"ok  parameters: {len(params)} computed, all in [0,1], ATT_SPAN correctly absent")


def test_error_breakdown_counts_and_flags_unclassified():
    events = [
        _event(correct=True),
        _event(correct=False, classification={"label": ATTENTION_LAPSE, "confidence": 0.7}),
        _event(correct=False, classification={"label": ATTENTION_LAPSE, "confidence": 0.5}),
        _event(correct=False, classification={"label": KNOWLEDGE_GAP, "confidence": 0.9}),
        _event(correct=False),  # never classified
    ]
    b = dase.error_breakdown(events)
    assert b["totalWrong"] == 4
    assert b["counts"][ATTENTION_LAPSE] == 2
    assert b["unclassified"] == 1, "unclassified errors must be visible, not silently dropped"
    assert abs(b["meanConfidence"][ATTENTION_LAPSE] - 0.6) < 1e-6
    assert b["meanConfidence"][PROCESSING_DELAY] is None
    print("ok  error breakdown: counts, mean confidence, unclassified surfaced")


def test_diagnostic_params_are_reported_but_not_scored():
    """A support profile must never score a student down for HAVING the condition.

    Regression: the ADHD profile originally weighted ATT_SPAN at 0.15, so a
    distracted-but-capable learner scored 0.568 under 'adhd' but 0.578 under
    'default' — the profile built to support them ranked them BELOW the generic
    one. Found by scripts/run_ablation.py.
    """
    distracted_capable = {
        "ACC": 0.55, "ADJ_ACC": 0.82, "COMP": 0.70, "EFFORT": 0.60,
        "LRN_VEL": 0.55, "TIME_EFF": 0.75, "CONSIST": 0.30,
        "TASK_COMP": 0.60, "ATT_SPAN": 0.30, "READ_FL": 0.70,
    }
    adhd = dase.compute_dase(distracted_capable, "adhd")
    default = dase.compute_dase(distracted_capable, "default")

    assert adhd["score"] > default["score"], (
        f"the ADHD profile ({adhd['score']}) must not score an ADHD learner below "
        f"the generic profile ({default['score']})"
    )
    assert "ATT_SPAN" not in adhd["usedWeights"], "ATT_SPAN must not be scored for ADHD"
    assert adhd["diagnosticOnly"]["ATT_SPAN"] == 0.3, (
        "ATT_SPAN must still be REPORTED — it is useful context for the teacher"
    )
    assert abs(sum(adhd["usedWeights"].values()) - 1.0) < 1e-6, "must renormalize after exclusion"

    # Same principle for dyslexia and reading fluency.
    dys = dase.compute_dase(distracted_capable, "dyslexia")
    assert "READ_FL" not in dys["usedWeights"], "READ_FL must not be scored for dyslexia"
    assert "READ_FL" in dys["diagnosticOnly"]
    print(f"ok  diagnosticOnly: adhd={adhd['score']:.3f} > default={default['score']:.3f}, ATT_SPAN reported not scored")


def test_every_profile_is_scorable():
    config = dase.load_config()
    params = {"ACC": 0.7, "COMP": 0.6, "EFFORT": 0.8, "LRN_VEL": 0.5}
    for name in config["profiles"]:
        result = dase.compute_dase(params, name)
        assert result["score"] is not None, f"profile '{name}' scored None with common params"
        assert 0.0 <= result["score"] <= 1.0
    print(f"ok  all {len(config['profiles'])} profiles produce a valid score")


def test_empty_session_returns_no_score_not_zero():
    assert dase.compute_parameters([]) == {}
    result = dase.compute_dase({}, "adhd")
    assert result["score"] is None, "no data must yield None, never 0.0"
    print("ok  empty session: score is None, not a misleading zero")


if __name__ == "__main__":
    tests = [
        test_processing_delay,
        test_attention_lapse_needs_focus_evidence,
        test_comprehension_barrier_needs_present_and_fast,
        test_ambiguity_is_admitted_not_invented,
        test_baseline_is_personal_not_cohort,
        test_confidence_scales_with_evidence,
        test_missing_parameters_are_absent_not_zero,
        test_profiles_rank_the_same_student_differently,
        test_adj_acc_uses_confidence_not_binary_label,
        test_parameters_from_realistic_session,
        test_error_breakdown_counts_and_flags_unclassified,
        test_diagnostic_params_are_reported_but_not_scored,
        test_every_profile_is_scorable,
        test_empty_session_returns_no_score_not_zero,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 2 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
