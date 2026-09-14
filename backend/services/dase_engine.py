"""DASE — Disability-Adaptive Scoring Engine.

Two coupled pieces, in dependency order:

  1. classify_error()  — why was this answer wrong?
  2. compute_dase()    — a multi-dimensional profile, weighted per disability

The classifier is UPSTREAM of the score, not a sibling feature: ADJ_ACC (accuracy
after discounting attention lapses) is a DASE parameter and carries the heaviest
single weight in the ADHD profile. Without the classifier that parameter does not
exist and the ADHD profile collapses toward generic accuracy scoring.

Design decisions that differ from the original plan, and why — see
IMPLEMENTATION_ROADMAP.md §2:

  * Baselines are the student's OWN rolling median, never a cohort median. A
    cross-student median is the neurotypical baseline the research explicitly
    warns against.
  * Every classification carries a confidence, and ADJ_ACC consumes the
    confidence rather than the binary label, so a weak classifier cannot
    dominate the metric it feeds.
  * Parameters with no data source are omitted and the weights renormalized,
    rather than stubbed to a constant that silently dilutes the real ones.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "dase_profiles.json"

# Enough prior responses for a personal median to mean anything. Below this the
# classifier still runs but caps its confidence.
MIN_BASELINE_SAMPLES = 5
# Below this many focus samples the webcam signal is not trustworthy (contract §3.1).
MIN_FOCUS_SAMPLES = 5

KNOWLEDGE_GAP = "KNOWLEDGE_GAP"
ATTENTION_LAPSE = "ATTENTION_LAPSE"
PROCESSING_DELAY = "PROCESSING_DELAY"
COMPREHENSION_BARRIER = "COMPREHENSION_BARRIER"

ERROR_TYPES = [KNOWLEDGE_GAP, ATTENTION_LAPSE, PROCESSING_DELAY, COMPREHENSION_BARRIER]


def load_config() -> Dict[str, Any]:
    with open(_CONFIG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


_CONFIG = load_config()


def profile_weights(profile: str) -> Dict[str, float]:
    profiles = _CONFIG["profiles"]
    entry = profiles.get(profile) or profiles["default"]
    return dict(entry["weights"])


def diagnostic_only(profile: str) -> List[str]:
    """Parameters this profile REPORTS but must not SCORE.

    A parameter must not count toward the composite if a more severe form of the
    same disability would mechanically lower it, independent of how much the
    student learned — scoring it penalises the student for having the condition.
    ATT_SPAN under the ADHD profile is the clearest case: attention span *is* the
    condition. Surfaced by scripts/run_ablation.py.
    """
    profiles = _CONFIG["profiles"]
    entry = profiles.get(profile) or profiles["default"]
    return list(entry.get("diagnosticOnly", []))


# ─────────────────────── error classification ───────────────────────


@dataclass
class Classification:
    label: str
    confidence: float
    signals: Dict[str, Any] = field(default_factory=dict)
    # What else it could plausibly have been. Makes the ATTENTION_LAPSE /
    # COMPREHENSION_BARRIER ambiguity visible instead of hiding it behind a
    # single confident-looking label.
    alternatives: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "signals": self.signals,
            "alternatives": self.alternatives,
        }


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def rolling_median(times: Sequence[float]) -> Optional[float]:
    """Median of the student's own recent response times."""
    usable = [t for t in times if t and t > 0]
    if not usable:
        return None
    return statistics.median(usable)


def classify_error(
    *,
    time_ms: int,
    prior_times_ms: Sequence[float],
    focus_ratio: Optional[float] = None,
    focus_samples: int = 0,
    answer_changes: int = 0,
    time_to_first_interaction_ms: Optional[int] = None,
    re_read: bool = False,
    timed_out: bool = False,
) -> Classification:
    """Classify a single WRONG answer by probable cause.

    Only ever called on incorrect answers — a correct answer has no error to explain.
    """
    baseline = rolling_median(prior_times_ms)
    n_prior = len([t for t in prior_times_ms if t and t > 0])

    # How much to trust any comparison against the personal baseline.
    baseline_trust = _clamp(n_prior / MIN_BASELINE_SAMPLES) if baseline else 0.0
    focus_known = focus_ratio is not None and focus_samples >= MIN_FOCUS_SAMPLES
    focus_trust = _clamp(focus_samples / (MIN_FOCUS_SAMPLES * 2)) if focus_known else 0.0

    signals: Dict[str, Any] = {
        "timeMs": time_ms,
        "baselineMs": round(baseline) if baseline else None,
        "priorSamples": n_prior,
        "focusRatio": focus_ratio,
        "focusSamples": focus_samples,
        "answerChanges": answer_changes,
        "reRead": re_read,
    }

    ratio = (time_ms / baseline) if baseline else None
    if ratio is not None:
        signals["timeRatio"] = round(ratio, 2)

    # ── 1. Processing delay: engaged for a long time, or ran out of clock.
    # Checked first because a long, effortful wrong answer is unambiguous —
    # whatever else happened, the student did not disengage.
    if timed_out:
        return Classification(PROCESSING_DELAY, 0.9, signals)
    if ratio is not None and ratio >= 2.0:
        # Evidence of actual work (changing answers) strengthens it.
        conf = _clamp(0.5 + 0.2 * min(ratio - 2.0, 1.0) + (0.15 if answer_changes else 0.0))
        return Classification(PROCESSING_DELAY, conf * max(baseline_trust, 0.5), signals)

    # ── 2 & 3. The hard case: fast AND wrong.
    # ATTENTION_LAPSE and COMPREHENSION_BARRIER are both "fast + wrong" and are
    # separated ONLY by the focus signal — which is face-presence, not gaze. When
    # focus data is missing or thin we cannot honestly tell them apart.
    is_fast = ratio is not None and ratio <= 0.5
    is_very_fast = ratio is not None and ratio <= 0.33

    if is_fast:
        speed_strength = _clamp((0.5 - ratio) / 0.5)

        if focus_known and focus_ratio is not None and focus_ratio < 0.6:
            # Fast, wrong, and looking away -> lapse.
            distraction = _clamp((0.6 - focus_ratio) / 0.6)
            conf = min(speed_strength, distraction, focus_trust, max(baseline_trust, 0.4))
            return Classification(
                ATTENTION_LAPSE,
                conf,
                signals,
                alternatives=[COMPREHENSION_BARRIER] if conf < 0.6 else [],
            )

        if focus_known and focus_ratio is not None and focus_ratio >= 0.6 and is_very_fast and not re_read:
            # Present and looking, answered almost instantly, never went back to
            # the stem -> the question itself did not land.
            conf = min(speed_strength, focus_trust, max(baseline_trust, 0.4))
            return Classification(
                COMPREHENSION_BARRIER,
                conf,
                signals,
                alternatives=[KNOWLEDGE_GAP] if conf < 0.6 else [],
            )

        if not focus_known:
            # No usable focus data. Guessing between the two would be inventing a
            # result. Fall back to KNOWLEDGE_GAP but record what we could not rule
            # out, so the teacher dashboard and the paper both see the ambiguity.
            return Classification(
                KNOWLEDGE_GAP,
                0.3,
                {**signals, "reason": "fast answer, no usable focus data"},
                alternatives=[ATTENTION_LAPSE, COMPREHENSION_BARRIER],
            )

    # ── 4. Default: engaged, took a normal amount of time, still wrong.
    # This is the honest residual, and the label we fall back to whenever the
    # signals conflict.
    conf = 0.5 + 0.25 * baseline_trust + (0.1 if re_read else 0.0)
    if ratio is not None and 0.7 <= ratio <= 1.5:
        conf += 0.15  # squarely normal timing strengthens it
    return Classification(KNOWLEDGE_GAP, _clamp(conf), signals)


def should_represent(classification: Classification) -> bool:
    """Whether the Phase 2.4 closed loop should serve the simpler variant.

    Deliberately narrow: only a comprehension barrier we are reasonably sure about.
    Re-presenting on a knowledge gap would just show the student a question they
    still cannot answer, in easier words — which teaches nothing and wastes time.
    """
    return (
        classification.label == COMPREHENSION_BARRIER
        and classification.confidence >= _CONFIG.get("representThreshold", 0.45)
    )


# ─────────────────────── parameter computation ───────────────────────


def _safe_mean(values: Sequence[float]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


# Voice commands slower than this are treated as fully inefficient. Generous on
# purpose: the target is "did the interface get out of the way", not "was the
# student quick", and penalising a blind student for thinking is the exact trap
# the diagnosticOnly rule exists to avoid.
_NAV_TARGET_MS = 4000
MIN_VOICE_SAMPLES = 3


def _voice_parameters(voice_events: List[dict]) -> Dict[str, float]:
    """VOICE_Q and NAV_EFF from voice interaction logs (Phase 3).

    VOICE_Q  — how well the system understood the student.
    NAV_EFF  — how efficiently a command turned into the intended action.

    Both measure THE INTERFACE, not the student. A low VOICE_Q means our
    recogniser and intent rules failed them; it must never read as a deficit in
    the learner, and nothing here is phrased as one on the dashboard.
    """
    if len(voice_events) < MIN_VOICE_SAMPLES:
        return {}

    params: Dict[str, float] = {}

    # ── VOICE_Q: understood-first-time rate, with a penalty for repeats.
    understood = [1.0 if e.get("understood") else 0.0 for e in voice_events]
    repeats = [int(e.get("repeats") or 0) for e in voice_events]
    repeat_penalty = _clamp(sum(repeats) / (len(voice_events) * 2))
    understood_rate = _safe_mean(understood) or 0.0

    # STT confidence when the browser reports it (Chrome sometimes returns 0).
    confidences = [
        float(e["sttConfidence"])
        for e in voice_events
        if e.get("sttConfidence") not in (None, 0, 0.0)
    ]
    if confidences:
        stt_quality = _safe_mean(confidences) or 0.0
        params["VOICE_Q"] = _clamp(
            0.6 * understood_rate + 0.4 * stt_quality - 0.2 * repeat_penalty
        )
    else:
        params["VOICE_Q"] = _clamp(understood_rate - 0.2 * repeat_penalty)

    # ── NAV_EFF: only commands that actually completed an action.
    timings = [
        int(e["actionMs"])
        for e in voice_events
        if e.get("actionMs") and e.get("understood")
    ]
    if timings:
        efficiencies = [_clamp(_NAV_TARGET_MS / t) if t > 0 else 0.0 for t in timings]
        # A command that was never understood cost the student time too, so the
        # understood-rate scales the result rather than being ignored.
        params["NAV_EFF"] = _clamp((_safe_mean(efficiencies) or 0.0) * understood_rate)

    return params


def compute_parameters(
    question_events: List[dict],
    reading_events: Optional[List[dict]] = None,
    sessions: Optional[List[dict]] = None,
    voice_events: Optional[List[dict]] = None,
) -> Dict[str, float]:
    """Derive DASE parameters from raw telemetry.

    Returns only parameters that could actually be computed. A parameter with no
    data source is ABSENT, not zero — zero would read as "the student scored 0".
    """
    reading_events = reading_events or []
    sessions = sessions or []
    voice_events = voice_events or []
    params: Dict[str, float] = {}

    # ── VOICE_Q / NAV_EFF (Phase 3). Computed before the early return: a blind
    # student may navigate by voice without answering a single question, and that
    # session still tells us how well the voice layer served them.
    params.update(_voice_parameters(voice_events))

    answered = [e for e in question_events if e.get("selected") is not None or e.get("correct")]
    if not answered:
        return params

    n = len(answered)
    correct = [bool(e.get("correct")) for e in answered]

    # ── ACC
    params["ACC"] = sum(correct) / n

    # ── ADJ_ACC: confidence-weighted credit for attention lapses.
    # Uses confidence rather than the binary label so a shaky classifier moves the
    # score only slightly (roadmap §2.3).
    credit_for_lapse = _CONFIG.get("attentionLapseCredit", 0.75)
    total_credit = 0.0
    has_classification = False
    for event in answered:
        if event.get("correct"):
            total_credit += 1.0
            continue
        cls = event.get("classification") or {}
        if cls:
            has_classification = True
        if cls.get("label") == ATTENTION_LAPSE:
            total_credit += credit_for_lapse * float(cls.get("confidence", 0.0))
    if has_classification:
        params["ADJ_ACC"] = total_credit / n

    # ── COMP: accuracy on the harder items, where understanding (not recall) is tested.
    hard = [e for e in answered if (e.get("difficulty") or 3) >= 3]
    if len(hard) >= 3:
        params["COMP"] = sum(bool(e.get("correct")) for e in hard) / len(hard)

    # ── TIME_EFF: against the student's OWN median, never a cohort mean.
    times = [e.get("timeMs") for e in answered if e.get("timeMs")]
    baseline = rolling_median(times)
    if baseline and len(times) >= 3:
        # 1.0 when at or faster than personal baseline, decaying as it exceeds it.
        ratios = [min(baseline / t, 1.0) if t else 0.0 for t in times]
        params["TIME_EFF"] = _safe_mean(ratios) or 0.0

    # ── ATT_SPAN: face-presence proxy. Absent without trustworthy webcam data.
    focus = [
        e.get("focusRatio")
        for e in answered
        if e.get("focusRatio") is not None and (e.get("focusSamples") or 0) >= MIN_FOCUS_SAMPLES
    ]
    if focus:
        params["ATT_SPAN"] = _safe_mean(focus) or 0.0

    # ── CONSIST: stability of performance within each difficulty band.
    by_difficulty: Dict[int, List[int]] = {}
    for event in answered:
        by_difficulty.setdefault(event.get("difficulty") or 3, []).append(
            1 if event.get("correct") else 0
        )
    variances = [
        statistics.pvariance(scores) for scores in by_difficulty.values() if len(scores) >= 2
    ]
    if variances:
        # pvariance of 0/1 data maxes at 0.25, so scale by 4 to reach [0,1].
        params["CONSIST"] = _clamp(1.0 - (_safe_mean(variances) or 0.0) * 4)

    # ── EFFORT: engagement signals, independent of whether the answer was right.
    effort_parts: List[float] = []
    for event in answered:
        engaged = 0.0
        engaged += 0.3 if (event.get("answerChanges") or 0) > 0 else 0.0
        engaged += 0.2 if event.get("reRead") else 0.0
        engaged += 0.2 if (event.get("revisits") or 0) > 0 else 0.0
        t = event.get("timeMs") or 0
        if baseline and t >= baseline * 0.5:
            engaged += 0.3  # gave it real time rather than clicking through
        effort_parts.append(_clamp(engaged))
    if effort_parts:
        params["EFFORT"] = _safe_mean(effort_parts) or 0.0

    # ── LRN_VEL: improvement across the session.
    if n >= 6:
        half = n // 2
        first = sum(correct[:half]) / half
        second = sum(correct[half:]) / (n - half)
        # Map a delta of [-1, 1] onto [0, 1]; 0.5 means no change.
        params["LRN_VEL"] = _clamp(0.5 + (second - first) / 2)

    # ── TASK_COMP
    if sessions:
        completed = sum(1 for s in sessions if (s.get("summary") or {}).get("completed"))
        params["TASK_COMP"] = completed / len(sessions)

    # ── READ_FL: reading speed relative to a 200 wpm reference, capped at 1.
    if reading_events:
        wpms = []
        for event in reading_events:
            words, elapsed = event.get("wordsRead") or 0, event.get("elapsedMs") or 0
            if words >= 20 and elapsed > 1000:
                wpms.append(words / (elapsed / 60000))
        if wpms:
            params["READ_FL"] = _clamp((_safe_mean(wpms) or 0.0) / 200.0)

    return params


# ─────────────────────── scoring ───────────────────────


def compute_dase(
    parameters: Dict[str, float], profile: str = "default"
) -> Dict[str, Any]:
    """Weighted composite over whatever parameters are actually available.

    Weights are renormalized across present parameters, so a profile that names a
    parameter we cannot yet measure is not penalised for it.
    """
    weights = profile_weights(profile)
    diagnostic = set(diagnostic_only(profile))

    # Scored weights exclude diagnostic-only parameters entirely. Their weight is
    # not redistributed by hand — renormalization over the remainder does it.
    scorable = {k: w for k, w in weights.items() if k not in diagnostic}
    usable = {k: w for k, w in scorable.items() if k in parameters and w > 0}
    total_weight = sum(usable.values())

    reported_diagnostics = {
        k: round(parameters[k], 4) for k in diagnostic if k in parameters
    }

    if not usable or total_weight == 0:
        return {
            "score": None,
            "profile": profile,
            "parameters": parameters,
            "usedWeights": {},
            "diagnosticOnly": reported_diagnostics,
            "missingParameters": sorted(set(scorable) - set(parameters)),
            "coverage": 0.0,
        }

    score = sum(parameters[k] * w for k, w in usable.items()) / total_weight

    return {
        "score": round(score, 4),
        "profile": profile,
        "parameters": {k: round(v, 4) for k, v in parameters.items()},
        "usedWeights": {k: round(w / total_weight, 4) for k, w in usable.items()},
        # Measured and shown on the dashboard, but deliberately NOT scored —
        # see diagnostic_only().
        "diagnosticOnly": reported_diagnostics,
        # Which declared parameters were unavailable, and how much of the profile's
        # intended scorable weight we actually covered. A score at 40% coverage is a
        # weaker claim than one at 90%, and the dashboard must be able to say so.
        "missingParameters": sorted(set(scorable) - set(parameters)),
        "coverage": round(total_weight / sum(scorable.values()), 3) if scorable else 0.0,
    }


def error_breakdown(question_events: List[dict]) -> Dict[str, Any]:
    """Counts by error cause, plus how confident we were on average."""
    wrong = [e for e in question_events if not e.get("correct")]
    counts = {t: 0 for t in ERROR_TYPES}
    confidences: Dict[str, List[float]] = {t: [] for t in ERROR_TYPES}
    unclassified = 0

    for event in wrong:
        cls = event.get("classification") or {}
        label = cls.get("label")
        if label in counts:
            counts[label] += 1
            confidences[label].append(float(cls.get("confidence", 0.0)))
        else:
            unclassified += 1

    total = sum(counts.values())
    return {
        "counts": counts,
        "proportions": (
            {k: round(v / total, 3) for k, v in counts.items()} if total else {k: 0.0 for k in counts}
        ),
        "meanConfidence": {
            k: round(sum(v) / len(v), 3) if v else None for k, v in confidences.items()
        },
        "totalWrong": len(wrong),
        "unclassified": unclassified,
    }
