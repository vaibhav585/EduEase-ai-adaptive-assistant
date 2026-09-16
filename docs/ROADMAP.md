# Roadmap — scope decisions and current status

Merges what were three overlapping documents (`upgrade_implementation_plan.md`,
`IMPLEMENTATION_ROADMAP.md`, `docs/future-work.md`) into one. The original
research-to-plan draft and its since-superseded DASE formula draft are
dropped entirely — the corrected, actually-implemented formulas are in
[PROJECT_EXPLANATION.md §4.6](PROJECT_EXPLANATION.md#46-dase--the-disability-adaptive-scoring-engine).
What actually happened phase-by-phase, with bugs and fixes, is in
[PHASE_LEARNINGS.md](PHASE_LEARNINGS.md). This doc keeps only what's still
useful going forward: the scope triage and current per-disability status.

## Scope triage (original v2.0 planning)

The original plan spanned ~10–13 weeks across 5 phases and ~25 new files.
What was judged worth building, in order:

| Phase | Item | Why |
|---|---|---|
| P0 | Disability profile + telemetry persistence + backend consolidation | Everything else is blocked on this |
| P1 | LLM quiz generation + LLM simplification profiles | Fixes garbage-in for DASE |
| P2 | DASE v1 (measured params only) + error classifier + closed loop | The core novelty |
| P3 | Blind: voice navigation + voice-first chatbot + image descriptions | Biggest inclusivity gap |
| P4 | Teacher dashboard on real data: radar, error breakdown, LLM recommendations | Turns telemetry into something a teacher can act on |
| P5 | Deaf: deaf simplification profile + visual alerts | |
| P6 | UI pass: icons/images on every action | |

**Promoted to in-scope, each roughly a day once P1's prompt-profile
mechanism existed:** dyscalculia mode, anxiety mode (without webcam-based
anxiety detection), dysgraphia voice-to-text, an Easy-Read profile for
intellectual disability.

**Deliberately cut, and why:**

| Cut | Reason |
|---|---|
| Bidirectional sign-language recognition (MediaPipe → GNN) | Multi-year research problem, not buildable in this scope |
| Sign language dictionary popup | No free, licensable ASL/ISL video API with usable coverage |
| Webcam anxiety detection (blink rate, lip pressing) | Not measurable with face-landmark tracking; inferring a clinical state from it is unsupportable and an ethics liability. Interaction-pattern signals (answer changes, long pauses) are kept and called *hesitation*, never *anxiety* |
| `pacing_engine.py` as a separate service | It's one number — the student's own median response time — folded into DASE's `TIME_EFF` baseline instead |
| POS colour-coded text | No evidence it helps deaf readers specifically |
| Proactive accessibility analyzer | Alt-text generation via image description already covers the adjacent need |

## Current implementation status by disability

DASE can score all 13 profiles declared in `dase_profiles.json`. Content
generation (simplification wording/structure, quiz item format) currently
covers 9 of them — the other 4 fall back to the `default` content style
while still getting their own DASE weighting:

| Disability | Simplify + quiz content profile | DASE scoring profile |
|---|---|---|
| dyslexia, deaf, autism, adhd, blind, dyscalculia, intellectual, anxiety | ✅ dedicated | ✅ dedicated |
| low_vision | uses `default` content | ✅ dedicated |
| hard_of_hearing | uses `default` content | ✅ dedicated |
| dysgraphia | uses `default` content | ✅ dedicated |
| motor | uses `default` content | ✅ dedicated |

## Known gaps, not yet built

- **DASE closed-loop UI**: the backend generates and validates a
  `simplerQuestion`/`simplerOptions`/`simplerAnswer` variant per item, and
  `should_represent()` decides when to use it, but `QuizPage.tsx` doesn't
  currently re-present it on a `COMPREHENSION_BARRIER` classification — the
  student always sees the original question again on retry.
- **Voice navigation UI**: `backend/services/intent.py` and the
  `/api/voice/*` endpoints exist and are tested, but no frontend component
  currently calls them — a student cannot yet navigate the app by voice.
- **`FRUST` DASE parameter**: declared with a nonzero weight in most
  profiles but has no data source; always renormalizes out (§4.6, Layer 3).
  The chatbot's per-turn frustration score (§4.2) is a separate, real-time-only
  signal and intentionally does not feed this.
- **`VIS_ENG`/`WRIT_EXP` DASE parameters**: declared, no data source yet.
