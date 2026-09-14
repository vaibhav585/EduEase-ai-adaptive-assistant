# EduEase v2.0 — Implementation Roadmap

Execution plan derived from `upgrade_implementation_plan.md` + `disability_research_compilation.md`,
reconciled against the **actual** state of this codebase.

Read this alongside the plan doc. Where the two disagree, this one wins — the plan doc was written
against files that are placeholders.

---

## 0. Reality check — what actually exists today

| Plan doc assumes | Reality |
|---|---|
| `backend/services/quiz_gen.py` has quiz logic to modify | 1-line `# Placeholder`. All service files except `nlp_simplify` / `translate_service` are empty stubs. |
| `backend/routers/*` are live | Mount lines are **commented out** in `app.py`. Real logic is a monolith in `app.py` on root paths. |
| `frontend/src/services/api.ts` talks to the backend | Calls `/api/*`, which is not mounted. **Dead code.** Real calls are inline `axios` to `http://localhost:8000/...`. |
| New modes go in `frontend/src/routes/` | That directory is dead 2-line stubs, not wired into `App.tsx`. Real pages are `src/pages/`. |
| Student disability profile exists | **Does not exist.** `AuthForm.tsx` writes only `{ email, role }`. |
| Quiz/session data is available for scoring | **Nothing is persisted.** `QuizPage.tsx` holds score in React state and discards it. No timing, no attempts, no focus log. |
| Teacher dashboard shows student performance | Hardcoded array of 3 fake students. |

**Consequence:** DASE, error classification, and the teacher analytics dashboard are all blocked on a
data layer that does not exist. Phase 0 below builds it. Nothing in Phases 2+ can be demoed without it.

### Other defects found

- `/simplify-text/` replaces words with spaCy **lemmas** — it degrades readability. Everything downstream reads this output.
- `/generate-quiz/` is fill-in-the-blank with random distractors, and `question.topic` is **never set** — so QuizPage's "Focus Areas to Improve" is permanently empty.
- `Eye.tsx` does **not** track gaze-on-target despite running a 5-point calibration. It only checks whether WebGazer returned any data in the last 1.5s — i.e. **"is a face visible"**. Usable as a presence proxy; must not be reported to teachers as attention-on-content.
- Gemini API key is **hardcoded** at `app.py:18`; `serviceAccountKey.json` is committed. (Firebase web keys in `firebase.ts` are public by design and fine — but there are no Firestore security rules.)
- `ConversationChain` in `app.py` uses **one global memory shared by every user**. Student A sees Student B's chat context.

---

## 1. Scope triage

The plan doc is ~10-13 weeks across 5 phases and ~25 new files. Below is what earns its place.

### BUILD — core, in order

| # | Item | Why |
|---|---|---|
| P0 | Disability profile + telemetry persistence + backend consolidation | Everything else is blocked on this |
| P1 | LLM quiz generation + LLM simplification profiles | Faculty's "better assessments"; fixes garbage-in for DASE |
| P2 | DASE v1 (measured params only) + error classifier + **closed loop** | The core novelty |
| P3 | Blind: voice navigation + voice-first chatbot + image descriptions | Faculty's explicit ask; biggest inclusivity gap |
| P4 | Teacher dashboard on real data: radar, error breakdown, LLM recommendations | Faculty's "performance metrics to teachers" |
| P5 | Deaf: deaf simplification profile + auto-generated diagrams + visual alerts | Faculty's explicit ask |
| P6 | UI pass: icons/images on every action, fix button padding | Faculty's explicit ask; ~1 day |

### BUILD IF TIME — *promoted to in-scope for week 9, given a full semester*

All four ride on the Phase 1 prompt-profile mechanism, so each is roughly a day once P1 exists.
They are also what lets the paper claim **8+ disability types** rather than 5.

- Dyscalculia mode (visual number line + dyscalculia prompt profile)
- Anxiety mode (calming UI + micro-assessments) — **without** webcam anxiety detection
- Dysgraphia: voice → structured text (STT + one Gemini prompt, ~20 lines)
- Easy-Read profile for intellectual disability (one more prompt profile, nearly free once P1 lands)

### CUT — and why

| Cut | Reason |
|---|---|
| Bidirectional sign-language recognition (MediaPipe → GNN) | Multi-year research problem. The research doc itself lists it as an open gap. Not buildable here. |
| Sign language dictionary popup | No free, licensable ASL/ISL video API with usable coverage. Also depends on an unanswered question (which sign language). |
| Webcam anxiety detection (blink rate, lip pressing) | WebGazer cannot measure this. Inferring a clinical state from it is unsupportable and an ethics liability in a disability project. Keep interaction-pattern signals only (answer changes, long pauses) and call them *hesitation*, not anxiety. |
| `pacing_engine.py` as a separate service | It is one number: the student's own median response time. Fold into DASE's `TIME_EFF` baseline. Don't add a file. |
| POS colour-coded text (`VisualTextReader`) | ~1 hour with spaCy, but no evidence it helps deaf readers. Build only if a demo slot needs filling. |
| Proactive accessibility analyzer | Real, but adjacent. Alt-text generation already arrives with P3.3. |

---

## 2. Corrections to DASE before you implement it

The concept is sound and genuinely novel. These four things will otherwise get picked apart in review.

### 2.1 — 17 parameters, ~7 have data sources

`FRUST`, `BREAK_FR`, `WRIT_EXP`, `VIS_ENG`, `PATTERN`, `VOICE_Q`, `NAV_EFF` have no measurable input
today. A parameter stubbed to a constant contributes nothing but *dilutes the weights of the real
ones*, and is trivially exposed by anyone who probes it. **Ship v1 with only measured parameters and
renormalize the weights over them.** Document the rest as future work.

v1 measurable set: `ACC`, `ADJ_ACC`, `COMP`, `TIME_EFF`, `ATT_SPAN` (presence proxy), `CONSIST`,
`EFFORT`, `LRN_VEL`, `TASK_COMP`, `READ_FL`. Add `NAV_EFF` / `VOICE_Q` when P3 lands, `VIS_ENG` when P5 lands.

### 2.2 — "Where did 0.15 come from?" is the first question you will be asked

Right now: nowhere. Three-part defence:

- Keep the literature-grounded rationale you already wrote per disability.
- Make weights **config, not code** — `dase_profiles.json`, teacher-adjustable, defaults shipped.
  (This also answers plan doc Q1: *both*.)
- Run an **ablation**: score the same session under each disability profile and show the ranking
  changes. That table is your evidence the weighting actually does something, and it costs one script.

### 2.3 — The error classifier's thresholds are the weakest link

`median_time / 3` and `/ 5` are invented, and a difficulty-band median *across students* is exactly
the neurotypical baseline your own research doc warns against. **Use the student's own rolling median
response time** as the baseline — same code, defensible, and it gives you the individualized pacing
from plan doc Phase 4.4 for free.

Also: two of the four classes (`ATTENTION_LAPSE`, `COMPREHENSION_BARRIER`) are both "fast + wrong",
separated only by the webcam signal — which is a face-presence proxy. Expect them to blur. Emit a
confidence field, fall back to `KNOWLEDGE_GAP` when signals conflict, and never show a low-confidence
label to a teacher as fact.

### 2.4 — The strongest novelty is the closed loop, not the formula

Classifying error cause is novel; *acting* on it in real time is what no one has shipped, and what
demos in 30 seconds: `COMPREHENSION_BARRIER` → immediately re-present the same concept in a simpler
format → the student then gets it right. Build that loop in P2. It is the centrepiece.

Also: never present DASE as a single number replacing a grade. Profile first, one composite second,
and state plainly that it is a learning-support signal, not an achievement measure.

---

## 3. Phase plan

### Phase 0 — Foundation (blocking, ~4-6 days)

**0.1 Disability profile**

- `AuthForm.tsx`: add disability multi-select (none / dyslexia / adhd / autism / blind / deaf /
  dyscalculia / anxiety), severity, and accommodations. Write to `users/{uid}`.
- Firestore: `users/{uid}.profile = { disabilities: [], severity, prefs }`.
- New `frontend/src/hooks/useProfile.ts` — one hook, readable anywhere. Replaces the empty `useAppStore.ts`.
- Settings page to edit it later.

**0.2 Telemetry — the thing DASE eats**

- New `frontend/src/services/telemetry.ts`: buffer events, flush to backend.
- Event shape per question: `{ session_id, student_id, question_id, difficulty, selected, correct,
  time_ms, focus_ratio, focus_samples, attempts, hints_used, answer_changes, revisits, ts }`.
- `QuizPage.tsx`: per-question timer, count answer changes, subscribe to `Eye`'s focus callback, emit
  an event on submit, write a session summary on finish.
- `LearningPage.tsx`: emit reading events (words read, wpm, replays, TTS use, focus ratio) → feeds
  `READ_FL` and `ATT_SPAN`.
- New `backend/routers/telemetry.py` → `POST /api/events` (batch), writes `sessions/{id}/events/*`.

**0.3 Backend consolidation** *(do it now; it gets 3x more expensive after 20 new files land)*

- Move the four handlers out of `app.py` into the existing empty routers. Mount them. `app.py` becomes wiring only.
- **Keep the existing root paths working** (`/upload-pdf/`, `/simplify-text/`, `/generate-quiz/`,
  `/chatbot/`) so the frontend doesn't break, and mount the same routers under `/api` as well.
- Delete or repoint the dead functions in `frontend/src/services/api.ts`; pick one call style.
- Delete `frontend/src/routes/` stubs and the unused component stubs (`Charts`, `ControlsBar`,
  `Stepper`, `QuizCard`, `TTSControls`, `STTButton`, `SimplifiedView`, `IconStepCard`, `ProgressBar`,
  `FocusHighlighter`, `EyeTracker`) — ~15 files of noise, or fill them as you build.

**0.4 Security (do before any faculty demo)**

- Gemini key → `.env` + `os.environ`. Rotate the exposed one.
- `serviceAccountKey.json` → gitignore. Rotate.
- Per-user chatbot memory keyed by uid. Currently one global `ConversationBufferMemory`.
- Firestore rules: a student reads only their own data; teachers read their class.
- Disability data is health-adjacent. `docs/ethics-privacy.md` exists — fill it in; consent screen at signup.

---

### Phase 1 — Real content pipeline (~4-5 days)

**1.1 LLM simplification with disability profiles** → `backend/services/nlp_simplify.py` (replace the lemma logic)

- One function, one prompt template, a dict of per-disability profile instructions: `dyslexia` (short
  sentences, active voice, no clause nesting), `deaf` (≤4th-grade vocab, no idioms or metaphor,
  concrete/visual language, emoji anchors), `autism` (literal, no figurative language, explicit
  structure), `easy_read` (ID), `dyscalculia` (number concepts in concrete terms), `default`.
- Cache by `hash(text + profile)` in Firestore — Gemini calls are the cost driver.
- Return readability metrics alongside (fill `services/readability.py`: Flesch-Kincaid, ~15 lines).
- `LearningPage.tsx`: pass the student's profile; show before/after grade level.

**1.2 LLM quiz generation** → fill `backend/services/quiz_gen.py`

- Gemini generates real questions with `question`, `options`, `answer`, **`topic`** (fixes the empty
  Focus Areas), `difficulty` 1-5, `question_type`, `explanation`, `concept_id`.
- **Disability-adapted item formats** (this is "Deaf-Specific Assessment Mode" from the research doc):
  deaf → diagram/matching/sorting items, minimal reading; blind → no spatial or visual items, no
  drag-drop, audio-native phrasing; dyslexia → shorter stems, read-aloud ready; dyscalculia →
  step-scaffolded numeric items.
- Generate a **parallel simpler variant of every item** — required by the P2 closed loop.
- Keep the spaCy generator as the fallback when Gemini fails.

---

### Phase 2 — DASE + closed loop (~6-8 days) ← the novelty

- **2.1** `backend/services/dase_engine.py` — parameter computation from telemetry; weight profiles
  loaded from `backend/data/dase_profiles.json`; renormalized over available parameters.
- **2.2** Error classifier in the same file, using **per-student rolling median**, emitting
  `{ label, confidence, signals }`.
- **2.3** `backend/routers/evaluation.py` — `POST /api/evaluate`, `GET /api/evaluation/{sid}`,
  `GET /api/evaluation/{sid}/errors`.
- **2.4 Closed loop in `QuizPage.tsx`** — on `COMPREHENSION_BARRIER`, immediately re-present the
  simpler variant from 1.2 and log whether the retry succeeds. **This is the demo.** On
  `ATTENTION_LAPSE` N times in a row, offer a break (ADHD).
- **2.5** Tests: `backend/tests/test_dase.py` — known telemetry fixtures → expected scores; classifier
  boundary cases; the ablation table from §2.2.

---

### Phase 3 — Blind support (~6-8 days)

- **3.1** `frontend/src/components/VoiceNavigator.tsx` — global, push-to-talk **and** wake-word toggle
  (always-on mic is a privacy and battery problem; make it opt-in). Regex intent match for the ~10 core
  commands, Gemini fallback via `backend/routers/voice_intent.py` for the rest. Web Audio tones for
  listening/thinking/speaking. `Esc` and "stop" always interrupt.
- **3.2** Voice-first mode in `Chatbot.tsx` — STT → chatbot → TTS loop, barge-in interrupt, state
  chimes. Note: this needs **per-user memory from 0.4**, or it leaks other students' conversations.
- **3.3** `backend/services/image_describer.py` — pdf2image + Gemini Vision on upload, producing an
  *educational explanation* rather than alt-text, stored with the content and spoken when reached.
- **3.4** Audio orientation — page structure announcement on entry, "40% through", ARIA live regions,
  distinct tones for heading/paragraph/question. Fold into `VoiceNavigator` rather than a separate
  component unless it grows.
- **3.5** Accessibility baseline that all of the above depends on: real focus management, skip links,
  ARIA landmarks, labelled controls, visible focus rings, keyboard-reachable everything. Test with
  **NVDA** (free, Windows). *Answer to plan doc Q2: build the voice layer AND be screen-reader-correct
  — they are not alternatives. A voice navigator on a page NVDA can't parse is a demo, not a product.*
- **3.6** Disable `Eye.tsx`/webcam for blind profiles and drop `ATT_SPAN` from their DASE weights — the
  plan doc's blind formula already omits it; make sure the code does too.

---

### Phase 4 — Teacher dashboard on real data (~4-5 days)

- **4.1** Delete the mock array. `backend/routers/analytics.py` → class roster, per-student DASE
  history, error breakdown, class aggregates.
- **4.2** `DASERadarChart.tsx` (Recharts `RadarChart` — already a dependency) — student vs
  **disability-adjusted cohort norm**, not a neurotypical mean.
- **4.3** `ErrorClassificationChart.tsx` — error-cause breakdown, per student and class-wide,
  drill-down to the question. Show confidence; grey out low-confidence classifications.
- **4.4** LLM recommendations — Gemini over the DASE profile → concrete teaching actions. Cache; never
  regenerate per page load.
- **4.5** Trend lines over time (makes `LRN_VEL` visible), and a CSV export — teachers ask for it.

---

### Phase 5 — Deaf support (~4-5 days)

- **5.1** `deaf` profile — already done in 1.1 if you build it there.
- **5.2** `backend/services/visual_generator.py` — Gemini emits **Mermaid** flowchart/mindmap source
  from content; `VisualSummary.tsx` renders it (`mermaid` npm, one new dep) plus icon concept cards.
- **5.3** `AccessibleNotification.tsx` — modality switched by profile: visual flash / border pulse /
  Vibration API for deaf; audio tone for blind; both otherwise. **Replaces every `alert()` in the app**
  (`LearningPage.tsx` has two).
- **5.4** Captions wherever audio exists, with an LLM-simplified transcript alongside the verbatim one.

---

### Phase 6 — UI pass (~1-2 days, faculty asked directly)

- Icon + image on every action card and button; consistent icon set (`lucide-react`, one dep).
- Fix the button padding/whitespace complaint across `LearningPage`, `QuizPage`, `DashboardPage`.
- Minimum 44×44px touch targets (also covers motor disability, research doc §4.E).
- High-contrast, large-text, and dyslexia-font toggles, persisted to the profile.
- Illustrations on empty states — currently bare text.

---

## 4. Sequencing

**Settings for this project:** full semester · 3+ builders · simulated/classmate testers ·
deliverable is **both** a working demo and a paper.

```
Week 1-2    Phase 0        EVERYONE. Blocking. Ends with the data contract FROZEN.
Week 3      Phase 1        Content pipeline. Still mostly shared.
Week 4-5    Phase 2        DASE + closed loop.        <- novelty locked in, do not parallelise this
─────────── fork into three tracks ───────────
Week 6-8    Track A  Phase 3   Blind (voice nav, voice chatbot, image descriptions, NVDA)
Week 6-8    Track B  Phase 4   Teacher dashboard on real data
Week 6-8    Track C  Phase 5   Deaf (visual generator, alerts, deaf assessment items)
─────────── rejoin ───────────
Week 9      Phase 6        UI pass + integration + extras (dyscalculia, anxiety, dysgraphia)
Week 10     Usability study + ablation runs + paper figures
Week 11-12  Buffer, demo rehearsal, writeup
```

### Why Phase 0 and 2 must NOT be parallelised

Three people forking before the telemetry event shape is frozen produces three incompatible event
schemas and a week of merge pain. Phase 0 ends with a **written, frozen data contract** — the event
JSON shape, the Firestore collection layout, and the `useProfile` hook signature — committed to the
repo. Track A/B/C all read it and nobody changes it unilaterally after week 2.

Same for Phase 2: DASE is one file and the whole project's novelty. One person owns
`dase_engine.py`; the other two work on Phase 1 leftovers and Phase 6 UI during weeks 4-5.

### Track ownership

| Track | Phase | Skill bias | Dependencies |
|---|---|---|---|
| A | 3 — Blind | Frontend, Web Speech / Web Audio, ARIA | per-user chat memory (0.4), blind item formats (1.2) |
| B | 4 — Teacher dashboard | Backend + Recharts | DASE output (2.1-2.3), telemetry (0.2) |
| C | 5 — Deaf | Frontend + prompt engineering | deaf profile (1.1), deaf item formats (1.2) |

Track B is the riskiest handoff — it can't start until Phase 2 emits real scores. Give that person
Phase 4.1 (the analytics router + killing the mock array) during week 5 while DASE finishes, so they
aren't idle.

---

## 4b. Paper track (runs alongside, don't leave it to week 10)

Deliverable is a paper as well as a demo, so these artefacts are **build outputs, not writeup chores**:

- **Ablation table** (§2.2) — script it in Phase 2, not at the end. `scripts/run_ablation.py`:
  same session scored under all disability profiles → CSV → table. Re-run it every time weights change.
- **Classifier agreement check** — hand-label ~50 wrong answers from your own test sessions with the
  cause you believe it was, compare against the classifier. That confusion matrix is the single most
  valuable table in the paper, and it will honestly show `ATTENTION_LAPSE` vs `COMPREHENSION_BARRIER`
  blurring (§2.3). Report it — a stated limitation is worth more than a hidden one.
- **Closed-loop effect size** — Phase 2.4 logs whether the re-presented simpler variant succeeds.
  "N% of comprehension-barrier errors were recovered on re-presentation" is your headline result.
  Make sure the logging exists from day one of P2.4.
- **Readability delta** — before/after Flesch-Kincaid per profile (from 1.1). One table, nearly free.
- **Limitations section** — write it as you go: presence proxy is not gaze, no clinically diagnosed
  participants, weights are literature-informed but unvalidated, n is small and simulated.

### Usability study (week 9-10, ~2 days)

With classmates/simulated users, not clinical participants — so frame it as a **usability** study,
never an efficacy study. Say that explicitly in the paper.

- Blindfolded navigation task, 5 users, Track A's voice layer + NVDA. Measure task completion, time,
  and where they got lost.
- Sound-off task for the deaf track: can they complete a lesson with no audio and no captions missed?
- SUS questionnaire (10 items, standard, free) → one number per track.
- Recruit at least one person with an actual disability if you possibly can, even informally. One real
  user's feedback outweighs ten simulated ones, and reviewers ask.

---

## 4c. Consent, even with classmates

You are collecting webcam-derived data and disability self-reports. Even for simulated testers:
a one-screen consent at signup, a stated retention period, and a delete-my-data path. Cheap to build
in Phase 0.4, and its absence is the kind of thing a faculty reviewer on a *disability* project will
notice immediately.

---

## 5. Answers to the plan doc's open questions

- **Q1 (fixed vs teacher-adjustable weights):** Both. Ship research-grounded defaults in
  `dase_profiles.json`, let teachers override per student, and log the overrides. The override log is
  itself a result worth reporting.
- **Q2 (screen reader vs own voice layer):** Both, and not as alternatives — see §3.5.
- **Q3 (which extra disabilities first):** Agreed — **anxiety + dyscalculia**, and both are cheap once
  Phase 1's prompt-profile mechanism exists. Anxiety **without** webcam detection.
- **Q4 (which sign language):** Moot — the dictionary is cut. If it returns, ISL for an Indian cohort,
  and budget for the fact that ISL digital resources are far thinner than ASL.

---

## 6. Verification

- `test_dase.py` — fixtures → known scores; classifier boundaries; ablation table.
- `test_quiz_gen.py` — generated items have all required fields incl. `topic`; simpler variant exists.
- NVDA end-to-end walkthrough of the blind path; keyboard-only walkthrough of everything.
- Readability check: assert the simplified output's grade level actually drops.
- Closed loop: simulate a `COMPREHENSION_BARRIER`, assert the simpler variant is served.
- Faculty review of `dase_profiles.json` weights before the demo.
