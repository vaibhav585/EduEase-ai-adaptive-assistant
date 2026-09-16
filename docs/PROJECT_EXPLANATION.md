# EduEase — Project Explanation

What this system is, how it's built, and — in full detail — every calculation
it runs on a student's data: what's measured, how it's captured, the exact
formula, and why that formula rather than something simpler.

For terminology and event shapes referenced below, see [DATA_CONTRACT.md](DATA_CONTRACT.md)
and [API_REFERENCE.md](API_REFERENCE.md). For the research basis behind the
disability-specific design choices, see [DISABILITY_RESEARCH.md](DISABILITY_RESEARCH.md).

---

## 1. What EduEase does

A learning platform for students with disabilities (dyslexia, ADHD, autism,
blind/low-vision, deaf/hard-of-hearing, dyscalculia, dysgraphia, anxiety,
intellectual disability, motor) and their teachers. A student uploads a PDF
lesson; the system:

1. Simplifies the text to that student's reading level **and** disability profile.
2. Generates a quiz from it, adapted the same two ways.
3. Answers questions about it via a RAG-backed chatbot.
4. Tracks how the student engaged with each question (time, focus, hesitation).
5. Turns that telemetry into a **DASE score** — a disability-weighted composite
   of ten measured parameters, not a single accuracy percentage — plus a
   classification of *why* each wrong answer happened.
6. Shows a teacher their own students' scores, trends, and AI-generated
   teaching suggestions grounded in that data.

## 2. Architecture

```
[Frontend: React + Vite + TypeScript]
        |  REST (axios, Firebase ID token on every request)
        v
[Backend: FastAPI (Python)]
        |                              |
        v                              v
[Firestore (Firebase)]        [Google Gemini / Groq LLMs]
  users, sessions, events,      simplify, quiz, chat,
  evaluations, quiz_results     recommendations, sentiment
```

- **Frontend** (`frontend/`): React + Vite + TypeScript, Tailwind CSS
  (Material-3-style token palette), React Router, `react-firebase-hooks` for
  auth state, i18next for EN/HI/TA. `services/api.ts` is the single axios
  client — an interceptor attaches the signed-in user's Firebase ID token to
  every request. `hooks/useProfile.ts` is the single source of truth for a
  student's accessibility prefs and disability profile.
- **Backend** (`backend/`): FastAPI. `app.py` holds the original monolith
  (auth-gated upload/simplify/quiz/chatbot/admin/teacher routes); `routers/`
  holds the DASE/telemetry/voice routers added later, all mounted under
  `/api`; `services/` holds the stateless logic each route calls into
  (`nlp_simplify`, `quiz_gen`, `dase_engine`, `readability`, `llm`, `intent`,
  `image_describer`). `auth.py` has the two auth dependencies
  (`verify_user`, `verify_role`) every protected route uses.
- **Auth**: Firebase Authentication. The backend verifies each request's ID
  token against Google's public signing keys (`firebase_config.py`) — this is
  independent of the service-account credential used for Firestore access.
- **Database**: Firestore. Key collections: `users` (profile, role,
  `teacher_id` for the roster model, accessibility prefs), `sessions` +
  `sessions/{id}/events` (raw telemetry), `evaluations` (persisted DASE
  scores), `quiz_results`/`telemetry_sessions` (older coarse per-quiz logs,
  still used for the teacher dashboard's score/focus charts).
- **LLMs**: Google Gemini is primary for every generative task (simplify,
  quiz, chatbot, recommendations, image description). Gemini's free tier is
  20 requests/day — Groq is an automatic fallback for text/JSON generation
  when Gemini fails or its quota is exhausted (`services/llm.py`).

## 3. The content pipeline

**Upload → simplify → quiz → chat**, all disability- and grade-aware:

1. `POST /upload-pdf/` — extracts text (capped at 5 MB / 20 pages so one
   upload can't burn the day's Gemini quota), ingests it into a FAISS vector
   store for the chatbot's retrieval, optionally describes embedded images
   (Gemini Vision, opt-in — only useful to blind/low-vision students).
2. `POST /simplify-text/` — rewrites the text on **two independent axes**
   (`services/nlp_simplify.py`):
   - **Grade level** (1st–8th): sets a hard per-sentence word-count ceiling
     (8 words for grade 1, up to 15 for grade 8) and a vocabulary ceiling.
   - **Disability profile** (9 profiles): sets *structure* — sentence length,
     figurative language, pronoun use, tone. E.g. the `deaf` profile forbids
     idioms and passive voice; `dyslexia` forbids subordinate clauses and
     repeats nouns instead of using pronouns.
   A dyslexic 5th-grader gets both: grade level sets the vocabulary ceiling,
   disability profile sets the sentence structure — whichever gives the
   *tighter* sentence-length limit wins (`_max_sentence_for`).
3. `POST /generate-quiz/` — same two-axis system, described in full in §4.4.
4. `POST /chatbot/` — RAG: retrieves relevant chunks from the FAISS index,
   applies safety guardrails (prompt-injection detection, PII redaction,
   output filtering), answers via a `ConversationChain` with per-session
   memory, and scores the turn for frustration (§4.5).

None of this is scored data — it's content generation. Section 4 covers
everything that turns into a *number*.

## 4. Every calculation, in detail

### 4.1 Readability — grade level and reading ease

**What's measured:** how hard a piece of text is to read, computed identically
before and after simplification so the "before → after" improvement is
provable, not just asserted.

**Where:** `backend/services/readability.py`, `analyze(text)`.

**Inputs, from the raw text only:**
- `words_per_sentence` = word count ÷ sentence count
- `syllables_per_word` = total syllables ÷ word count (syllables counted by a
  vowel-group heuristic with the standard silent-`e` correction — about 85%
  accurate, which is enough since the metric is only ever compared
  before-vs-after on the *same* text, never used as an absolute number on
  its own)

**Formula (Flesch-Kincaid):**

```
gradeLevel  = 0.39 x words_per_sentence + 11.8 x syllables_per_word − 15.59
readingEase = 206.835 − 1.015 x words_per_sentence − 84.6 x syllables_per_word
```

`gradeLevel` is clamped to ≥ 0, `readingEase` clamped to [0, 100] — the raw
formula can go negative or over 100 on very short/simple text, which would
read as a bug on the dashboard.

**Why this formula:** it's the standard US-grade-level readability metric and
needs only sentence/word/syllable counts — no external model call, instant,
free. It's deliberately *not* used as a pass/fail gate on its own (see
`gradeDelta` below) because technical vocabulary that must be preserved
("photosynthesis", "chlorophyll") makes an absolute reading-ease target
unreachable for some source material.

**Derived numbers, computed by `simplify_text()`:**
- `gradeDelta = before.gradeLevel − after.gradeLevel` — how many grades the
  rewrite dropped. Bigger is a bigger simplification.
- `shortEnough = after.avgSentenceLength <= maxSentenceTarget` — did the
  rewrite hit the profile's sentence-length ceiling (§3, whichever of
  grade-level or disability-profile is tighter)?
- `easier = after.gradeLevel <= before.gradeLevel`
- `metTarget = shortEnough and easier` (always `false` if the LLM was
  unreachable and the fallback returned the original, un-simplified text)

### 4.2 Chatbot frustration score

**What's measured:** how frustrated the student sounds, per chat turn, so the
UI can offer to simplify or suggest a break.

**Where:** `backend/app.py`, `_score_sentiment()`.

**This is not a formula** — it's a second, smaller/faster LLM call
(`gemini-2.0-flash`, capped at 256 output tokens, 10s timeout) given the
student's message and the assistant's reply, with this exact rubric:

```
frustration_score: 0.0 (calm) to 1.0 (very frustrated)
suggested_action:
  if frustration_score > 0.7 -> "offer_break"   (forced by the prompt rule)
  if frustration_score > 0.4 -> "simplify"
  else                       -> "continue"
```

The model is instructed to output only that JSON. If the call fails for any
reason, the turn silently defaults to `{frustration_score: 0.0, suggested_action:
"continue"}` — a chat turn must never break because sentiment scoring failed.

**Why an LLM judgment instead of a rule-based score:** frustration is
expressed in open-ended text ("I don't get it AGAIN", short clipped replies,
repeated questions) that a keyword rule would miss constantly and a numeric
formula has no natural inputs for. This is a real-time, per-message signal —
it is **not** persisted anywhere and does **not** feed DASE; it only drives
the in-session UI nudge (and, in `<Eye/>`, an on-screen supportive banner).

### 4.3 Voice intent confidence

**What's measured:** how confident the system is that it correctly understood
a spoken command, for students navigating by voice (primarily blind students).

**Where:** `backend/services/intent.py`, `classify()`.

**Rules-first, LLM fallback only when rules miss** (speed, cost, and
reliability — the ~20 core commands are a closed set regex is exactly right
for, and Gemini's 5-req/minute free-tier limit would be exhausted in under a
minute if every utterance hit the LLM):

- A regex match (navigation, answer-selection, "stop", "repeat", etc.) →
  confidence **0.95** (an exact structured match like "answer B" or a bare
  destination word like "quiz" is close to certain), or **0.8/0.9** for looser
  single-keyword matches.
- No rule match, LLM fallback used → confidence is **fixed at 0.6** if the
  LLM returns a valid intent, regardless of what the model itself reports —
  an LLM guess is trusted less than a rule hit by design, and that gap is
  visible downstream in the `VOICE_Q` DASE parameter (§4.6).
- LLM returns `UNKNOWN` or something unparseable → confidence **0.0**, source
  `"llm"` or `"none"`. The system is instructed to say "I didn't understand"
  rather than guess a navigation target — sending a blind student to the
  wrong page is worse than admitting it didn't understand.

### 4.4 Quiz generation — question types, difficulty, validation

**What's generated:** exactly 9 questions per quiz — 3 multiple-choice, 3
true/false, 3 fill-in-the-blank — via one Gemini/Groq call
(`backend/services/quiz_gen.py`), on the same two independent axes as
simplification: a **format** ruleset per disability profile (e.g. `blind`
forbids spatial/visual items and announces structure in words; `deaf`
minimizes reading load) composed with an optional grade-level vocabulary
instruction.

**Per-item fields the model must return**, each validated before use
(`_valid`, `_type_options_valid`):

| Field | Rule |
|---|---|
| `question_type` | must be `mcq`, `true_false`, or `fill_blank` |
| `options` | `true_false` → exactly `{"True","False"}`; `mcq`/`fill_blank` → exactly 4, no duplicates |
| `answer` | must exactly match one of `options` — an answer not in `options` is the single most damaging failure the validator checks for, since the student could never possibly get it right and would be scored on a generator bug, not their own knowledge |
| `question` | non-empty; `fill_blank` must contain the literal `______` |
| `difficulty` | integer, clamped to `[1, 5]` (defaults to 3 if missing/unparseable) — this is the same difficulty value DASE's `COMP` parameter (§4.6) uses to pick out the "harder" items |
| `simplerQuestion`/`simplerOptions`/`simplerAnswer` | optional; validated with the *same* type/answer rules as the main question when present — this is the DASE closed-loop's simpler variant, served when the error classifier reports a comprehension barrier with high confidence (§4.7) |

Any item that fails validation is dropped rather than served broken — a
shorter quiz beats a quiz with an unanswerable question.

**Fallback (Gemini and Groq both unreachable):** a local spaCy generator
(`_fallback_quiz`) round-robins the three question types from the source
text's own sentences — picks a noun/verb/adjective to blank out, its
distractors from the rest of the document's vocabulary, and a topic label
from the first multi-word noun chunk in the sentence. Every fallback item
gets `difficulty: 3` (mcq/fill_blank) or `2` (true_false) and no
`simplerQuestion` — no disability adaptation, since there's no LLM to write
one. The response is marked `degraded: true`; **degraded results are
excluded from any DASE analysis**, since the questions came from this weak
generator, not from Gemini's disability-adapted formats.

### 4.5 The DASE closed loop (error classification)

**What's measured:** *why* a wrong answer was wrong — not just that it was.

**Where:** `backend/services/dase_engine.py`, `classify_error()`. Called only
on incorrect answers (a correct answer has no error to explain).

Four possible causes, each with distinct timing/focus signatures:

| Label | Meaning | Signals that produce it |
|---|---|---|
| `PROCESSING_DELAY` | Could have solved it, ran out of time | Timed out, or took ≥2x the student's own baseline response time |
| `ATTENTION_LAPSE` | Knew it, lost focus | Answered in ≤0.5x baseline **and** face-presence ratio < 0.6 (looking away) |
| `COMPREHENSION_BARRIER` | The question's wording didn't land | Answered in ≤0.33x baseline, present and looking (focus ≥ 0.6), never re-read the question |
| `KNOWLEDGE_GAP` | Engaged properly, still wrong | The honest residual — normal timing, normal focus, or not enough signal to tell the other three apart |

**The baseline is always the student's own rolling median** response time
over their prior answers this session (`statistics.median`) — never a cohort
average. A 3-second answer is fast for a slow reader and unremarkable for a
fast one; comparing against a shared average would misclassify both.

**Every classification carries a `confidence`** (0–1), built from how much
each signal deviates from its threshold and how many prior samples exist to
trust the baseline against (`baseline_trust`, capped until ≥5 prior answers
exist) and how much focus data exists to trust (`focus_trust`, capped until
≥5 focus samples exist). A `timed_out` answer is fixed at confidence 0.9; a
speed+focus match scales continuously with how far past the threshold the
signals are. When focus data is missing entirely, the classifier refuses to
guess between `ATTENTION_LAPSE` and `COMPREHENSION_BARRIER` — it returns
`KNOWLEDGE_GAP` at a low, explicit confidence (0.3) with both alternatives
recorded, rather than manufacture a confident-looking result from nothing.

**The closed loop** (`should_represent()`): only re-presents the question's
simpler variant when the label is `COMPREHENSION_BARRIER` **and** confidence
≥ `representThreshold` (**0.45**, `dase_profiles.json`). Deliberately narrow
— re-presenting a `KNOWLEDGE_GAP` in easier words would just show the student
a question they still can't answer, teaching nothing and wasting time.

### 4.6 DASE — the Disability-Adaptive Scoring Engine

This is the core scoring system: a student's quiz/session telemetry becomes
**ten separate 0–1 parameters** (never one blended grade), which are then
combined into one composite score using **weights that differ by declared
disability** — the same measurements, read through a different lens.

#### Layer 1 — parameters (`compute_parameters()`)

Each computed only when its data source exists; a parameter with no data is
**absent from the result**, never defaulted to 0 (a missing parameter must
never look like a zero score).

| Parameter | Formula | Data needed |
|---|---|---|
| `ACC` | correct ÷ answered | Any answered questions |
| `ADJ_ACC` | `(sum of 1.0 per correct answer + 0.75 x confidence per attention-lapse-classified wrong answer) ÷ total answered` | At least one classified wrong answer |
| `COMP` | correct ÷ answered, restricted to items with `difficulty >= 3` | ≥3 "hard" items answered |
| `TIME_EFF` | mean of `min(personalMedianTime / timeMs, 1.0)` across answers | ≥3 timed answers, a personal median |
| `ATT_SPAN` | mean face-presence ratio across answers | ≥5 focus samples per answer (webcam consent) |
| `CONSIST` | `1 − 4 x mean(population variance of correctness within each difficulty band)` | ≥2 answers in at least one difficulty band |
| `EFFORT` | mean of a per-answer engagement score: `+0.3` if the student changed their answer, `+0.2` if they re-read the question, `+0.2` if they revisited it, `+0.3` if they spent ≥ half their personal median time (capped at 1.0) | Any answered questions |
| `LRN_VEL` | `0.5 + (secondHalfAccuracy − firstHalfAccuracy) / 2` — maps an improvement delta of [−1, 1] onto [0, 1], where 0.5 means no change | ≥6 answered questions (needs two meaningful halves) |
| `TASK_COMP` | completed sessions ÷ started sessions | Session-completion data |
| `READ_FL` | mean words-per-minute across reading events, ÷ 200 (a 200-wpm reference pace), capped at 1.0 | Reading events with ≥20 words read and >1s elapsed |
| `VOICE_Q` | `0.6 x (fraction of voice commands understood first try) + 0.4 x (mean STT confidence) − 0.2 x (repeat rate)` | ≥3 voice command events |
| `NAV_EFF` | mean of `min(4000ms / actionTime, 1.0)` across *understood* voice commands, scaled by the understood-rate | ≥3 voice events, at least one that completed an action |

`VOICE_Q`/`NAV_EFF` measure **the interface**, not the student — a low
`VOICE_Q` means the speech recognizer or intent rules failed the student, and
is never phrased as a deficit in the learner. Three more parameters
(`VIS_ENG`, `WRIT_EXP`, `FRUST`) are declared in the config as intended
future signals but have no data source yet — they renormalize out
automatically wherever a profile names them (Layer 3), costing nothing to
declare.

#### Layer 2 — weights (per disability profile, `dase_profiles.json`)

A weight is an importance multiplier: how much a parameter counts toward the
final score for *this* profile. All 13 profiles' weights are config, not
code — a teacher can override them per student — and are documented with a
one-line rationale each in the file. Two examples:

- **`default`** (no disability declared) — accuracy dominates, like an
  ordinary grade: `ACC 0.30, COMP 0.15, EFFORT 0.15, LRN_VEL 0.15, TIME_EFF
  0.10, CONSIST 0.10, TASK_COMP 0.05`.
- **`adhd`** — raw accuracy drops to 0.15 and `ADJ_ACC` (accuracy *after*
  forgiving attention-lapse errors) becomes the largest term at 0.28, effort
  is rewarded heavily at 0.22. `ATT_SPAN` is declared at 0.15 but marked
  `diagnosticOnly` (see below) — attention span **is** the condition, so
  scoring it would penalize the student for having ADHD.

The full rationale for every profile's weights is in `dase_profiles.json`
itself, next to the numbers.

**The novelty in one sentence:** raw accuracy is worth 0.30 to a student with
no declared disability and 0.10 to a student with dyslexia — for the
dyslexic student, a wrong answer more often means "misread the question" than
"didn't understand it", so `COMP` (comprehension on hard items) is weighted
at 0.32 instead.

#### Layer 3 — renormalization (`compute_dase()`)

Weights are authored to sum to roughly 1.0, but some parameters always get
dropped for a given session — no data source that session, or marked
`diagnosticOnly` for this profile. The survivors are rescaled to sum back to
1.0, so a dropped parameter doesn't silently shrink the score:

```
usedWeight[k] = weight[k] / sum(weight[j] for every scorable, measurable j)
```

Example: ADHD declares 8 weights; `ATT_SPAN` is diagnostic-only and `FRUST`
has no data source. Six survive, summing to 0.90 — each is divided by 0.90
(`ADJ_ACC: 0.28 / 0.90 = 0.3111`).

#### Layer 4 — the score

```
score = sum(parameter[k] x usedWeight[k] for every usable k)
```

A worked example — a "distracted but capable" student under the `adhd`
profile:

```
ACC        0.55 x 0.15  = 0.0825
ADJ_ACC    0.82 x 0.28  = 0.2296
EFFORT     0.60 x 0.22  = 0.1320
TASK_COMP  0.60 x 0.10  = 0.0600
LRN_VEL    0.55 x 0.10  = 0.0550
CONSIST    0.30 x 0.05  = 0.0150
                          ------
                  sum   = 0.5741
           / weight sum   0.90
                          ------
             DASE score = 0.638
```

The *same* raw data scored under the `default` profile instead gives 0.578 —
same measurements, different lens, and the ADHD lens correctly rates this
student higher because it credits knowledge that attention lapses were
hiding rather than penalizing the lapses as if they were ignorance.

#### Supporting numbers

- **`coverage`** = `usedWeightSum / totalScorableWeight` — what fraction of
  the profile's *intended* scorable weight was actually measurable this
  session. This is the score's own honesty rating: a score at 40% coverage
  is a far weaker claim than one at 95%, and the teacher dashboard shows it
  next to every score rather than hiding it.
- **`diagnosticOnly`** parameters are computed and reported (shown on the
  radar chart / parameter breakdown) but excluded from the weighted sum. The
  rule: a parameter must not be scored in a profile if a *more severe* form
  of that same disability would mechanically lower it, independent of how
  much the student actually learned — scoring it would penalize the student
  for having the condition. (`ATT_SPAN` under `adhd`, `READ_FL` under
  `dyslexia`, `TIME_EFF` under most non-default profiles are current
  examples.)
- **`missingParameters`** — which of the profile's declared parameters had no
  data this session, listed explicitly rather than silently folded away.

### 4.7 Teacher-facing aggregates

`backend/routers/analytics.py` layers on top of the per-student score above,
scoped to only the calling teacher's own roster (`teacher_id` match):

- **Class average score** = mean of every scored student's latest `daseScore`
  (students with no evaluation yet are excluded, not treated as 0).
- **Average by primary disability** = the same mean, grouped by each
  student's declared `primary` disability (or `"none"`).
- **Average completion rate** = mean, across students who have any sessions
  at all, of `sessionsCompleted / sessionsTotal` per student.
- **AI teaching suggestions** (`/api/analytics/recommendation`): not a
  formula — Gemini/Groq are given the student's disability profile, latest
  DASE score + coverage, the full parameter breakdown, and the error-cause
  proportions, and asked for 2–4 concrete suggestions grounded in specific
  numbers from that data (never treating the DASE score as a grade, and
  explicitly flagging low-coverage results as a partial picture). Cached per
  evaluation so a dashboard reload doesn't re-spend a Gemini call.

## 5. Honesty caveats — stated once here, true everywhere above

- **The DASE weights are literature-informed, not empirically validated.**
  An ablation script (`backend/scripts/run_ablation.py`, if present) scores 5
  synthetic archetypes under all 13 profiles to prove the weighting
  *differentiates* students meaningfully — it does **not** prove the weights
  are *correct*. That requires real learner data.
- **`ATT_SPAN` / focus data is face-presence, not gaze.** `<Eye/>` uses
  MediaPipe face landmarks for real gaze-on-screen detection, but the DASE
  parameter it feeds should still be read as "was a face visible", never
  surfaced to a teacher as "attention" in a stronger sense than that.
- **A `degraded` result (LLM fallback used) should be excluded from analysis**
  — the content came from a weaker, non-adaptive generator.
- **A DASE score is only as strong as its `coverage`.** Always show coverage
  next to a score; never present a 40%-coverage score with the same
  confidence as a 95%-coverage one.

## 6. Running the project

**Backend:**
```
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
Needs `backend/.env` (`GOOGLE_API_KEY`, optionally `GROQ_API_KEY` for the
fallback) and `backend/serviceAccountKey.json` (Firebase service account —
never commit this).

**Frontend:**
```
cd frontend
npm install
npm run dev
```
Needs `frontend/.env` (`VITE_API_URL`, `VITE_FIREBASE_*` — must point at the
**same** Firebase project as the backend's service account, or auth/Firestore
reads will fail with permission errors that look unrelated).

Then open the URL Vite prints (typically `http://localhost:5173`).
