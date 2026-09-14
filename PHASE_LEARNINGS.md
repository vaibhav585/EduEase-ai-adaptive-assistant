# EduEase v2.0 — Phase Learnings Log

Running record of each implementation phase: what changed, why, what broke, and what we learned.
Written as we go, so the paper's methodology and limitations sections have real material rather than
reconstructed memory.

---

# Phase 0 — Foundation

**Status:** Complete
**Goal:** Build the data layer everything else depends on, and stop the bleeding on security.

---

## 0.1 What the problem actually was

The upgrade plan assumed a codebase that didn't exist. Before writing any code we traced every file
the plan proposed to touch, and found:

| Plan assumed | Reality |
|---|---|
| `services/quiz_gen.py` etc. had logic to modify | Six service files were 1-line `# Placeholder` comments |
| `routers/*` were live | Mount lines were **commented out**; all logic sat in an `app.py` monolith |
| `services/api.ts` called the backend | Called `/api/simplify` + `/api/translate`, **neither mounted — every call 404'd** |
| New modes go in `src/routes/` | Dead directory of 2-line stubs, never wired into `App.tsx` |
| Disability profiles existed | Nothing. `AuthForm` stored `{ email, role }` only |
| Quiz data was available to score | **Nothing persisted.** Score lived in React state and was discarded on unmount |

**The critical one:** DASE is the project's novelty claim, and it had *no inputs*. There was no
timing, no attempt count, no focus log, no disability label — nothing for a formula to consume. Phase
0 existed to fix exactly that.

> **Learning #1 — Audit before you plan, not after.**
> The research and the feature plan were both good. They were written against an imagined codebase.
> An hour of reading the actual files reordered the entire project: the highest-priority work turned
> out to be a data layer nobody had listed as a feature. *Plans describe intent; only the code
> describes the starting point.*

---

## 0.2 What we built

### The data contract (`DATA_CONTRACT.md`) — done first, deliberately

Three people fork into parallel tracks after Phase 2. If the telemetry event shape isn't frozen
before that, we get three incompatible schemas and a week of merge pain. So the contract was written
**before** any implementation, and the implementation was made to conform to it.

Defines: Firestore layout, `Profile`, `QuestionEvent`, `ReadingEvent`, `SessionSummary`, `Consent`,
and the Phase 0 API surface.

Two design decisions worth recording:

- **Flat `sessions` collection, not nested under `users/{uid}/sessions`.** The teacher dashboard
  (Phase 4) queries across every student in a class. Flat + a `studentId` field is one indexed query;
  nested would need a collection-group query for the same answer.
- **`serverTs` is authoritative, client `ts` is advisory.** Client clocks are wrong — sometimes by
  hours. Learning-velocity trends computed off a skewed client clock would be silently garbage.
  The contract states that anything analytical uses `serverTs`.

### Disability profile (0.1)

- `frontend/src/types/profile.ts` — 12 disability types, prefs, and three helpers that encode rules
  the rest of the app must not get wrong:
  - `scoringProfile()` — which DASE weight set applies
  - `webcamAllowed()` — **forces webcam off for blind/low-vision users** regardless of stored prefs
  - `applyPrefs()` — font scale / contrast / dyslexia font, applied to the document root
- `frontend/src/hooks/useProfile.ts` — single source of truth. Merges against defaults so accounts
  created before Phase 0 still work.
- `AuthForm.tsx` — multi-select disability capture, primary condition, severity, and sensible
  starting prefs derived from the selection (TTS on for blind/dyslexia, captions on for deaf, etc).

**`disabilities` is a list, not an enum.** Comorbidity is the norm — ADHD and dyslexia co-occur
constantly. A single-value field would have forced students to misrepresent themselves and would have
quietly corrupted the DASE profile assignment. `primary` exists separately for scoring.

**Disclosure is optional and `[]` is fully supported.** Every feature works without a declared
disability. Gating functionality on disclosure would pressure students into disclosing, which is
exactly wrong for this project.

### Telemetry (0.2) — the thing DASE eats

- `frontend/src/services/telemetry.ts` — buffered client (flush at 10 events or 5s), `sendBeacon` on
  tab-hide, re-queue with a cap on failure.
- `backend/routers/telemetry.py` — batch ingest, per-event validation, session start/end.
- `QuizPage.tsx` — now captures per question: `timeMs`, `timeToFirstInteractionMs`, `answerChanges`,
  `correct`, `difficulty`, `focusRatio`. Opens a session, writes a summary on finish.
- `LearningPage.tsx` — captures `wordsRead`, `wpmSetting`, `replays`, `pauseCount`, `ttsUsed`,
  `focusRatio`. Emits on unmount so navigating away still records the read.

Three rules baked in:

- **Telemetry must never break the lesson.** Every failure path is caught and logged. A student
  losing their quiz because an analytics POST 500'd is strictly worse than losing the analytics.
- **Ingest skips bad events instead of rejecting the batch.** One malformed event shouldn't cost a
  student their whole session.
- **Idempotency key is `(questionId, attempts)`.** A re-sent batch must not double-count — but the
  Phase 2.4 closed loop legitimately re-presents the same question, so `attempts` is part of the key.
  Keying on `questionId` alone would have silently swallowed every re-presentation, destroying the
  measurement the closed loop exists to produce.

> **Learning #2 — The idempotency key encodes a product decision, not just a database concern.**
> We nearly keyed on `questionId` alone. That would have deleted our headline result (closed-loop
> recovery rate) without any error appearing anywhere. Infrastructure choices made "for correctness"
> can silently destroy a research finding — check what each one erases.

### `FocusMeter` and the honesty problem

`Eye.tsx` runs a 5-point calibration that makes it *look* like gaze tracking. Reading it revealed it
only checks whether WebGazer returned any data in the last 1.5 seconds — i.e. **"is a face visible"**.
It does not know where the student is looking.

Rather than quietly feeding that into a field called "attention", we:
- named the signal `focusRatio` and documented it as face-presence in three places
  (contract, telemetry client, schema comment),
- return `null` when `focusSamples < 5` so thin data can't masquerade as a measurement,
- **added tab-visibility and window-blur as a second signal** — costs nothing, needs no camera, works
  for every student including blind users, and genuinely detects task-switching.

> **Learning #3 — Name a proxy after what it measures, not what you wish it measured.**
> Calling face-presence "attention" would have propagated into the DASE `ATT_SPAN` parameter, into
> the teacher dashboard, and into the paper — where a reviewer would have found it. Naming it
> honestly cost one rename and makes the limitations section defensible.

### Backend consolidation (0.3)

`app.py` went from a 147-line monolith to 40 lines of wiring. Handlers moved into
`routers/content.py`, `routers/chatbot.py`, `routers/telemetry.py`.

**Each router is mounted twice** — once at the legacy root paths (`/upload-pdf/`, `/simplify-text/`,
`/generate-quiz/`, `/chatbot/`) that the existing frontend calls, and once under `/api`. Cutting the
legacy paths would have broken the running app for zero benefit. They come out once every caller has
migrated.

> **Learning #4 — Do the structural move before the feature work, and keep both doors open.**
> Consolidating now cost about two hours. Doing it after Phase 3 adds ~20 new files would have cost
> days. Dual-mounting made it a zero-downtime change: nothing broke, and there was no "big bang
> migration" to schedule.

### Security (0.4)

| Issue | Before | After |
|---|---|---|
| Gemini API key | Hardcoded in `app.py:18` | `.env` via `config.py`; fails loudly at import if missing |
| Env files | `backend/env`, `frontend/env (1)` — untracked but **not gitignored** | Renamed to `.env`, ignore rules verified with `git check-ignore` |
| `serviceAccountKey.json` | Already ignored | Confirmed + `**/` pattern added |
| **Chatbot memory** | **One global `ConversationBufferMemory` shared by every user** | Per-user, LRU-capped at 500 users × 12 turns |
| Firestore access | No rules — any client could read every disability profile | `firestore.rules` written (**still needs deploying**) |
| Consent | None | Required data-collection consent + separate optional webcam consent at signup |

The chatbot one was the worst: **every student saw every other student's conversation context.** In a
disability-support app where students discuss what they struggle with, that's a serious privacy
breach, not a bug. It was invisible because it only manifests with concurrent users — which a
single-developer test never has.

> **Learning #5 — Shared mutable module-level state is a multi-user bug that single-user testing
> cannot find.** `conversation = ConversationChain(...)` at module scope looks completely normal and
> is completely broken. Anything holding user data at module level needs a key. We now check for this
> pattern specifically.

---

## 0.3 Problems hit, and how they were fixed

**1. `npm run build` had never worked — no `tsconfig.json` existed.**
Discovered when `npx tsc --noEmit` printed the help text instead of typechecking. `package.json`'s
build script was `tsc && vite build`, so the production build had been broken the entire time and
nobody noticed because everyone ran `npm run dev` (Vite strips types without checking them).
*Fix:* added `tsconfig.json` + `tsconfig.node.json` + `src/vite-env.d.ts`. Build now passes.

This mattered more than it first appeared: **a frozen data contract that isn't type-enforced is just
a document.** With `strict` on, a track that misspells an event field now fails the build instead of
writing a silently-wrong field name into Firestore.

**2. `TS6310: Referenced project may not disable emit`.**
Composite projects in a `references` array can't set `noEmit: true`.
*Fix:* `tsconfig.node.json` uses `outDir: "./.tsbuild"` instead; added to `.gitignore`.

**3. `vite build --root frontend` — `Unknown option --root`.**
The npx-fetched Vite CLI doesn't accept `--root` as a bare flag the way assumed.
*Fix:* ran `npm run build` from the frontend directory, using the project's own pinned Vite.
*Learning:* use the project's scripts, not a globally-fetched binary — versions drift.

**4. `PdfReader.extract_text()` returns `None` on image-only pages.**
The original `text += page.extract_text()` raised `TypeError` and killed the whole upload for any PDF
with one scanned page.
*Fix:* `page.extract_text() or ""`, plus a real 422 with a clear message when a PDF yields no text at
all ("this is probably a scanned document"). Previously it returned an empty string and the user got
a blank lesson with no explanation.

**5. Newly-registered teachers were bounced to the student dashboard.**
`AuthForm` always navigated to `/student-dashboard`, then `RoleGate` redirected them. Pre-existing;
surfaced while editing the file.
*Fix:* navigate on the role actually stored.

**6. Removed an `alert()` and had to replace the affordance, not just delete it.**
"Take a Quiz" used `alert()` when text wasn't ready. Deleting the alert would have made the button
silently do nothing. *Fix:* the button is now `disabled` and reads "Preparing lesson…". Phase 5.3
replaces the remaining alerts with the profile-aware notification system.

---

## 0.4 Before / after

| | Before | After |
|---|---|---|
| Disability profile | Did not exist | 12 types, comorbidity-aware, consented, drives prefs |
| Learning data captured | **None** | Per-question timing, hesitation, focus; per-session reading metrics |
| DASE inputs available | 0 of 17 parameters | ~10 have real sources; rest documented as future work |
| `app.py` | 147-line monolith | 40 lines of wiring |
| Dead code | ~19 stub files, 1 dead service module | Deleted |
| Frontend build | **Broken (no tsconfig)** | Passes, `strict` on, 0 errors |
| Chatbot privacy | Shared global memory | Per-user, LRU-capped |
| Secrets | Key hardcoded, env files un-ignored | `.env` + verified ignore rules |
| Firestore access | Unrestricted | Rules written (deploy pending) |
| Automated checks | None | `backend/test_phase0.py`, 5 checks, passing |

---

## 0.5 Verification

```
backend:   python test_phase0.py     -> 5/5 PASS
frontend:  npx tsc --noEmit          -> exit 0
frontend:  npm run build             -> built in 7.79s
ignore:    git check-ignore -v backend/.env frontend/.env serviceAccountKey.json -> all matched
```

The self-check deliberately covers the things that rot silently: legacy routes disappearing, event
schema drift, the idempotency key, and chatbot user isolation.

---

## 0.6 Carried forward

- [ ] **Deploy `firestore.rules`** — `firebase deploy --only firestore:rules`. Until then the database
      is open. Highest-severity open item.
- [ ] **Rotate both exposed keys** (Gemini + Firebase service account). They were in working-tree
      files; treat them as compromised.
- [ ] `frontend/.env` points at Firebase project `eduease-b955c`; `services/firebase.ts` hardcodes
      `ai-learning-app-3025f`. **Two different projects.** Resolve before Phase 1 — data is currently
      going somewhere nobody is looking at.
- [ ] Settings page to edit profile after signup (hook and types exist; UI doesn't).
- [ ] `docs/ethics-privacy.md` is still a stub. Needs filling before the usability study.
- [ ] Bundle is 1.17 MB — WebGazer and Firebase dominate. Code-split in Phase 6.
- [ ] `Eye.tsx` calibration UI implies gaze tracking it doesn't do. Either implement gaze-on-target
      or relabel the UI honestly. Phase 3 decision.

---

## 0.7 Transferable learnings

1. **Audit the code before trusting the plan.** The plan's file paths were fiction; the priority
   order was wrong because of it.
2. **Freeze the data contract before parallelising.** Cheap now, impossible later.
3. **Name proxies honestly.** `focusRatio` is face-presence. Saying so in the code stopped a false
   claim reaching the paper.
4. **Infrastructure choices can silently erase research findings** — the idempotency key nearly
   deleted our headline metric.
5. **Module-level mutable state is a multi-user bug invisible to single-user testing.**
6. **A type-checked contract beats a documented one.** The contract only became enforceable once
   `tsconfig.json` existed.
7. **When you remove a bad affordance, replace it** — a deleted `alert()` leaves a dead button.

---

# Phase 1 — Real content pipeline

**Status:** Complete
**Goal:** Replace placeholder simplification and quiz generation with disability-profiled LLM
versions, so that Phase 2's DASE scores something meaningful.

---

## 1.1 What the problem actually was

Phase 0 gave DASE inputs. Phase 1 had to make those inputs *worth measuring*.

**Simplification made text harder, not easier.** The old `/simplify-text/` replaced words with their
spaCy lemmas:

> "The plants use sunlight and produce oxygen" → "the plant use sunlight and produce oxygen"

It broke grammar, turned plurals into singulars, and reduced readability. Every downstream feature —
the reading view, the quiz, and eventually the DASE reading-fluency parameter — consumed this output.

**Quiz generation produced items that were often unanswerable.** It blanked a random noun out of a
sentence and offered three *other random nouns from the same document* as distractors. Consequences:

- distractors were frequently nonsense — "The ______ absorbs light" with options *leaves, process, energy, Tuesday*
- sometimes two options were both defensibly correct
- `topic` was **never set**, so the "Focus Areas to Improve" panel was permanently empty
- difficulty was always identical, so DASE could not compute per-difficulty baselines

> **Learning #8 — Garbage inputs make a novel metric worthless, not merely noisy.**
> Classifying *why* a student got a question wrong is meaningless when the question itself was
> broken. An error classifier running on the old generator would have labelled generator bugs as
> student knowledge gaps, and the resulting paper table would have been confidently wrong. Fixing
> the content pipeline was a prerequisite for the novelty claim, not a side quest.

---

## 1.2 What we built

| File | Purpose |
|---|---|
| `services/llm.py` | One shared Gemini client plus a JSON helper with fence-stripping and retry |
| `services/readability.py` | Flesch-Kincaid grade and reading ease, no new dependency |
| `services/cache.py` | Two-layer cache (in-process LRU then Firestore), keyed on `(text, profile)` |
| `services/nlp_simplify.py` | **9 disability profiles**, fidelity rules, degradation handling |
| `services/quiz_gen.py` | LLM items with disability-adapted formats and a simpler variant each |
| `scripts/readability_table.py` | Generates the paper's readability table |

### The nine simplification profiles

Each encodes a *specific documented barrier*, not a generic "make it simpler":

| Profile | The specific thing it fixes |
|---|---|
| `dyslexia` | Decoding cost — max 12 words/sentence, no nested clauses, repeat nouns instead of pronouns |
| `deaf` | 4th-grade reading level; **no idioms or metaphors** (a documented severe barrier); subject-verb-object only; avoids English-specific constructions such as phrasal verbs; emoji anchors on concrete nouns |
| `autism` | Literal reading; **the same word for the same concept every time** — synonym variation reads as a change of subject |
| `adhd` | Front-load the point; 2-3 sentence chunks; bold key term per chunk |
| `blind` | **Removes spatial deixis** ("as shown above", "the figure on the left") which is meaningless through a screen reader; spells out every symbol in words |
| `dyscalculia` | One operation per sentence; every number says what it counts; notation written as words |
| `intellectual` | Easy Read — max 8 words/sentence, restate the main point at the end |
| `anxiety` | Removes pressure language ("simply", "obviously", "just", "everyone knows") |
| `default` | Plain language |

The `blind` and `autism` profiles are the two we would defend as genuinely under-served. Almost all
"accessible text" tooling handles font and contrast, but still leaves "see the diagram below" in text
that will be read aloud, and still varies vocabulary for stylistic reasons.

### Quiz generation

Items now carry `topic`, `conceptId`, `difficulty` (1-5), `explanation`, and — critically — a
**simpler variant** (`simplerQuestion` / `simplerOptions` / `simplerAnswer`). Phase 2.4 serves that
variant when the error classifier reports `COMPREHENSION_BARRIER`. Generating it here means the
closed loop needs no extra LLM round-trip at the moment a struggling student is waiting on it.

Item *formats* adapt per profile, which generalises the research doc's "Deaf-Specific Assessment
Mode": blind students get no spatial or visual reasoning items and options distinguishable by ear;
deaf students get relationship, sequence and matching items with minimal reading load; autistic
students get items with exactly one defensibly correct answer and never "which is the BEST answer".

---

## 1.3 Problems hit, and how they were fixed

### 1. `metTarget` was always False — and the metric was wrong, not the prompts

Each profile initially had a Flesch Reading Ease floor (deaf at 85, roughly 4th grade). Every profile
failed it, including rewrites that were obviously good:

```
deaf     grade 15.5 -> 7.7   ease 16.2 -> 51.6   metTarget=False
```

Grade level nearly halved, sentences averaged 6.6 words, jargon was defined inline — and the check
reported failure.

**Cause:** Flesch Reading Ease is dominated by syllables-per-word, and `BASE_RULES` rule 1 *requires*
keeping every technical term. "Photosynthesis" is five syllables and cannot be removed from a lesson
about photosynthesis. The target was unreachable on technical text by construction.

**Fix:** measure the levers the prompt actually controls — **average sentence length** (each profile's
own stated word limit) **and** a requirement that grade level drops. Reported as two separate booleans
(`shortEnough`, `easier`) so a failure says *which* condition failed.

> **Learning #9 — A check that always fails gets ignored, which is worse than no check.**
> We nearly "fixed" this by lowering thresholds until they passed, which would have made the metric
> meaningless while still looking rigorous. The right move was noticing the metric measured something
> we had deliberately forbidden the model from changing. **Measure what your prompt instructs, so the
> check verifies faithfulness rather than wishful thinking.**

### 2. The simpler variant violated its own profile's rules

The deaf profile's simpler variant came back as:

```
opts = ['In: light, oxygen; Out: water.', 'In: CO2, water; Out: oxygen.', ...]
```

Compressed notation and a chemical formula — for a student who reads at 4th-grade level and is
*already struggling*, since the variant only appears after they got the original wrong.

**Cause:** the schema asked for "a simpler variant" without restating that the profile rules apply to
it. The model optimised for *shorter* and reached for notation.

**Fix:** added rule 9 — the variant must obey the profile rules at least as strictly as the main
question, and may never introduce abbreviations or symbols. Verified: notation gone.

> **Learning #10 — "Simpler" is not a direction an LLM can follow safely on its own.**
> Left unconstrained it compresses, and compression (symbols, abbreviations, notation) is the
> *opposite* of accessible. The fallback path needs its constraints stated at least as loudly as the
> main path, especially since it serves the most vulnerable moment in the flow.

### 3. Gemini wraps JSON in markdown fences regardless of instructions

Roughly a third of responses came back fenced despite the prompt demanding raw JSON.
**Fix:** strip fences with a regex before parsing rather than trusting the instruction, plus one
retry that names the parse error. *Validate model output structurally; never rely on the prompt
alone for format compliance.*

### 4. `UnicodeEncodeError` on the Windows console

The deaf profile's emoji anchors crashed test output — Windows consoles default to cp1252.
**Fix:** `PYTHONIOENCODING=utf-8` when running scripts. Worth knowing before a live demo on Windows;
the API itself is fine, this affects terminal printing only.

### 5. Wrote a file into the wrong `backend/`

The repo root contains a folder with the *same name as itself*
(`EduEase---ai-adaptive-assistant--master/EduEase---ai-adaptive-assistant--master/`). A relative
write created a stray outer `backend/scripts/`.
**Fix:** moved the file, removed the stray directory. *With a nested same-name folder, verify the
absolute path after creating any new directory tree.*

---

## 1.4 Before / after

| | Before | After |
|---|---|---|
| Simplification | spaCy lemma substitution — **made text harder** | 9 research-grounded LLM profiles |
| Reading level | Not measured | Grade level before/after, shown to the student |
| Quiz questions | Random-noun fill-in-the-blank | Real comprehension items with plausible distractors |
| `topic` | **Never set** — Focus Areas always empty | Set per item; Focus Areas works |
| `difficulty` | Always 3 | 1-5, enabling per-difficulty DASE baselines |
| Simpler variant | Did not exist | Generated per item, ready for the Phase 2.4 closed loop |
| Disability-adapted items | None | Item *format* adapts per profile |
| LLM failure | 500 / broken page | Degrades to original text, flagged, excluded from scoring |
| Gemini cost | 1 call per student per lesson view | Cached on `(text, profile)` |

**Measured example** — biology passage, source grade level 15.5:

| Profile | Grade after | Avg sentence | Target | Met |
|---|---|---|---|---|
| intellectual | 6.2 | 3.2 | 9.0 | yes |
| default | 6.5 | 7.4 | 20.0 | yes |
| anxiety | 6.7 | 3.0 | 16.0 | yes |
| dyscalculia | 7.6 | 6.4 | 14.0 | yes |
| deaf | 7.7 | 6.6 | 11.0 | yes |
| dyslexia | 8.1 | 4.7 | 13.0 | yes |
| adhd | 10.2 | 6.1 | 16.0 | yes |
| autism | 11.3 | 5.0 | 16.0 | yes |
| blind | 12.1 | 10.4 | 21.0 | yes |

`blind` reduces grade level the least — correctly. It preserves precision and spells symbols out in
words, which *adds* syllables. Optimising it for a lower grade score would make it worse for its
users. Another reason absolute readability targets were the wrong metric.

---

## 1.5 Verification

```
backend:   python test_phase1.py    -> 7/7 PASS   (LLM stubbed, offline, deterministic)
backend:   python test_phase0.py    -> 5/5 PASS   (no regression)
frontend:  npx tsc --noEmit         -> exit 0
frontend:  npm run build            -> built in 3.12s
live:      9 profiles x 3 passages against real Gemini (scripts/readability_table.py)
```

The offline suite stubs Gemini so it is free and deterministic. Live model quality is checked
separately by `scripts/readability_table.py`, which should be re-run after any prompt edit.

Notable test: `test_quiz_rejects_broken_items` asserts that an `answer` not present in `options` is
rejected. That failure mode is invisible to the student — they simply get it wrong — and DASE would
have recorded it as a knowledge gap. A generator bug masquerading as a learning deficit.

---

## 1.6 Carried forward

- [ ] Everything still open from §0.6 (Firestore rules, key rotation, duplicate Firebase projects).
- [ ] `explanation` is generated per item but not shown to students yet — Phase 2.4 decides where it
      belongs in the closed loop.
- [ ] Quiz items are cached on `(text, profile, count)`, so every student with the same profile sees
      identical questions. Fine for a class demo; a real deployment wants a larger generated pool
      with per-student sampling.
- [ ] No teacher review step before students see generated questions. For classroom deployment that
      is a requirement, not a nicety.
- [ ] `matching` and `sorting` item types are described in the deaf prompt but the frontend renders
      only MCQs. Track C (Phase 5) needs those renderers.

---

## 1.7 Transferable learnings (cumulative)

8. **Garbage inputs make a novel metric worthless, not merely noisy** — fix the content pipeline
   before building the thing that measures it.
9. **A check that always fails gets ignored.** Measure what your prompt actually instructs, so the
   check tests faithfulness rather than hope. Do not tune thresholds until they pass.
10. **"Simpler" is an unsafe instruction on its own** — LLMs compress, and compression is the
    opposite of accessible. Constrain the fallback path at least as hard as the main path.
11. **Validate model output structurally.** Gemini fences JSON about a third of the time no matter
    what the prompt says.
12. **Degrade to the honest original, never to broken output.** Unsimplified real text beats
    grammatically mangled text, and the `degraded` flag keeps bad data out of the analysis.

---

# Phase 2 — DASE + error classification + the closed loop

**Status:** Complete
**Goal:** The project's novelty claim. Build the scoring engine, the error-cause classifier it
depends on, and the closed loop that acts on the classification in real time.

---

## 2.1 What was built, and in what order

The order matters and is not the order the original plan implied. The classifier is **upstream** of
the score, not a sibling feature:

```
error classifier  ->  ADJ_ACC (a DASE parameter)  ->  DASE composite
                  ->  closed loop (re-present simpler variant)
                  ->  error breakdown (teacher dashboard, Phase 4)
```

`ADJ_ACC` carries the heaviest single weight in the ADHD profile. Without the classifier that
parameter does not exist and the ADHD profile collapses toward generic accuracy scoring — which is
the thing the whole project argues against.

| File | Purpose |
|---|---|
| `data/dase_profiles.json` | 13 weight profiles, rationale each, teacher-editable config |
| `services/dase_engine.py` | Classifier, parameter computation, weighted scoring, error breakdown |
| `routers/evaluation.py` | `/api/classify`, `/api/evaluate`, `/api/evaluation/{id}`, `/api/dase/profiles` |
| `scripts/run_ablation.py` | The evidence table that weighting does something |
| `test_phase2.py` | 14 checks, pure computation, no network |
| `QuizPage.tsx` | The closed loop |

---

## 2.2 The four corrections to the original DASE design

All four were written into the roadmap before implementation and all four survived contact with code.

### Correction 1 — parameters with no data source are ABSENT, not zero

The plan listed 17 parameters. Ten have real data sources today. A parameter stubbed to a constant
would silently dilute the weight of the real ones while looking like a measurement.

`compute_parameters()` returns only what it could compute, and `compute_dase()` renormalizes the
weights over what is present. Profiles still *declare* their full intended weights — including
`VOICE_Q` and `NAV_EFF` (Phase 3) and `VIS_ENG` (Phase 5) — so a parameter switches itself on the
moment its data source lands, with no config edit.

The response also reports `coverage`: what fraction of the profile's intended weight was actually
measured. A score computed at 37% coverage is a weaker claim than one at 90%, and the dashboard has
to be able to say so.

### Correction 2 — the baseline is the student's own rolling median

The plan compared response times against a per-difficulty median across students. That is exactly
the neurotypical baseline the research doc warns about.

`test_baseline_is_personal_not_cohort` pins the behaviour: an identical 3-second answer is
`KNOWLEDGE_GAP` for a student whose median is 3s, and `COMPREHENSION_BARRIER` for a student whose
median is 30s. Same number, opposite meaning.

This also delivers the plan's Phase 4.4 "individualised pacing" for free — it is the same median.

### Correction 3 — confidence, not binary labels

`ATTENTION_LAPSE` and `COMPREHENSION_BARRIER` are both "fast and wrong", separated only by the focus
signal — which is face-presence, not gaze. They were always going to blur.

So every classification carries a confidence, and **`ADJ_ACC` consumes the confidence rather than the
label**. A 0.1-confidence lapse moves the score by under 0.05; a 0.9-confidence lapse moves it
properly. A weak classifier therefore cannot dominate the metric it feeds.

### Correction 4 — the closed loop is the novelty, not the formula

Implemented in `QuizPage.handleSubmit`. On a wrong answer the quiz calls `/api/classify`; if the
result is a confident `COMPREHENSION_BARRIER` and a simpler variant exists (generated in Phase 1.2),
the student immediately gets the same concept in simpler words.

Measurement decisions that make the result honest:

- **Only the first attempt scores.** Credit for the re-presented variant would inflate results and
  make the recovery rate meaningless.
- **`attempts: 2` on the variant event**, so the Phase 0 idempotency key stores it as a distinct
  record rather than overwriting the first attempt.
- **Variant times are excluded from the personal baseline** — the variant is easier by construction,
  so including it would drag the median down and make later answers look artificially slow.
- The student sees "X of Y questions you missed turned out to be about the wording, not the idea".

---

## 2.3 The honesty test

`test_ambiguity_is_admitted_not_invented` is the test we would point a reviewer at first.

With no usable focus data, a fast wrong answer could be either an attention lapse or a comprehension
barrier, and **we cannot tell**. The classifier therefore does not pick one. It returns
`KNOWLEDGE_GAP` at confidence 0.3 and records both as `alternatives`.

The alternative — guessing 50/50 — would have produced a confident-looking error-cause pie chart on
the teacher dashboard that was, for those cases, fabricated.

Thin data is treated as no data: under 5 focus samples the webcam signal is ignored entirely, per
the contract.

---

## 2.4 The bug the ablation found

This is the most valuable thing that happened in this phase, and it is why `run_ablation.py` was
written during the phase rather than at write-up time.

The first ablation run produced:

```
archetype                default      adhd
distracted_capable         0.578     0.568
```

**The ADHD profile scored a distracted-but-capable learner LOWER than the generic profile did.**
The profile built to support them was actively harming them, and it ranked them last of five
archetypes.

**Cause:** the ADHD profile weighted `ATT_SPAN` at 0.15. Attention span *is* the condition. A student
with more severe ADHD therefore scored lower regardless of how much they learned. We had encoded
the exact discrimination the research doc describes — "pathologising normal neurodivergent
workflows" — directly into the weights, while writing a rationale that claimed the opposite.

The same flaw was present in `dyslexia`, which scored `READ_FL` at 0.15 — penalising slow reading,
which is the definition of dyslexia.

**Fix — one mechanism, stated as a rule:**

> A parameter must not be scored in a profile if a *more severe form of that same disability* would
> mechanically lower it, independent of how much the student learned.

Such parameters are listed in the profile's `diagnosticOnly`. They are still **computed and reported**
— they appear on the radar chart and in the parameter breakdown, because they are genuinely useful
context for a teacher — but they are excluded from the composite, and the remaining weights
renormalize over the gap.

Applied to: `ATT_SPAN` (adhd), `READ_FL` (dyslexia), `TIME_EFF` (blind, low_vision, anxiety, motor,
dyscalculia, intellectual).

After the fix: ADHD scores that learner **0.638 vs default 0.578** — the support profile now helps,
by +0.060. Pinned by `test_diagnostic_params_are_reported_but_not_scored`.

> **Learning #13 — A rationale is not an implementation.**
> Every profile had a paragraph explaining that it avoided penalising the disability. The ADHD
> rationale literally said "reward persistence rather than punish distractibility" — while the
> weights below it did the opposite. Nobody reading the JSON would have caught it; only running
> the numbers did.

> **Learning #14 — Build the evidence table during the phase, not at write-up.**
> Had `run_ablation.py` been left to week 10, this bug ships, the demo runs on it, and the paper
> reports results produced by a scorer that discriminated against the students it claimed to support.
> The table is not documentation of the work. It is part of the work.

---

## 2.5 Ablation results

Five synthetic archetypes scored under all 13 profiles:

```
archetype                default   adhd  dyslexia  autism  anxiety  intellectual
persistent_struggler       0.615  0.695     0.619   0.680    0.763         0.842
distracted_capable         0.578  0.638     0.622   0.523    0.579         0.534
slow_accurate              0.728  0.813     0.700   0.723    0.760         0.768
consistent_literal         0.670  0.713     0.599   0.767    0.658         0.726
strong_all_round           0.858  0.879     0.843   0.868    0.848         0.852
```

**7 distinct rankings across 13 profiles.** The weighting demonstrably changes who is ranked highest.

The most useful property is one we did not design for and only noticed in the output:

| archetype | score range across profiles | delta |
|---|---|---|
| strong_all_round (control) | 0.837 - 0.879 | **0.044** |
| distracted_capable | 0.534 - 0.638 | 0.106 |
| consistent_literal | 0.589 - 0.767 | 0.178 |
| slow_accurate | 0.697 - 0.813 | 0.116 |
| persistent_struggler | 0.608 - 0.842 | **0.234** |

**The profiles agree almost exactly on the unambiguous student and disagree most about the
struggling one.** That is the correct property: where performance is unambiguous the lens barely
matters, and where it is ambiguous the lens is the whole question. It also means the choice of
profile is a 23-point decision for exactly the students it matters most for — which is an argument
for the teacher-override mechanism, and a limitation to state plainly.

**Stated in the script output and worth repeating:** these are synthetic archetypes. The table shows
the weighting *differentiates*. It is **not** evidence the weights are *correct*. That needs real
learners.

---

## 2.6 Before / after

| | Before | After |
|---|---|---|
| Scoring | Single percentage | 13 profiles, 10 parameters, renormalized, with coverage reported |
| Wrong answers | Marked wrong | Classified by cause, with confidence and alternatives |
| Timing baseline | None | Student's own rolling median |
| A wrong answer | Ends the interaction | May trigger immediate re-presentation in simpler words |
| Recovery measurement | Impossible | `barriers` / `recovered` per session; the headline metric |
| Disability weights | In a plan document | `dase_profiles.json`, teacher-editable, ablation-verified |
| Evidence the approach works | Assertion | 7 distinct rankings, reproducible in one command |

---

## 2.7 Verification

```
backend:   python test_phase2.py             -> 14/14 PASS
backend:   python test_phase1.py             -> 7/7 PASS  (no regression)
backend:   python test_phase0.py             -> 5/5 PASS  (no regression)
backend:   python scripts/run_ablation.py    -> 7 distinct rankings, exit 0
frontend:  npm run build                     -> built in 3.18s
```

`run_ablation.py` **exits 1** if every profile produces an identical ranking — the novelty claim
failing is a build failure, not a footnote.

---

## 2.8 A blocking operational finding (from the Phase 1 table run)

The Phase 1 readability table exhausted the Gemini API quota partway through:

```
limit: 5,  metric: generate_content_free_tier_requests   (per minute)
limit: 20, metric: generate_content_free_tier_requests   (per day)
```

**The free tier is 5 requests/minute and 20/day.** One student opening one lesson costs 2 calls
(simplify + quiz). That is **10 students per day, total**, across the whole project.

This is a hard blocker for any classroom demo and it needs a decision now, not in week 10:

- enable billing on the Gemini project (pay-as-you-go raises limits substantially), or
- pre-generate and cache all demo content ahead of time (the Phase 1 cache makes this viable — a
  warmed cache serves unlimited students with zero calls), or
- both, which is what we would recommend: billing for development, pre-warmed cache for the demo
  so a network or quota problem cannot break a live presentation.

The silver lining: this was an unplanned real-world failure and **the Phase 1 degradation path
handled it correctly** — no crash, affected rows marked `LLM UNAVAILABLE`, valid CSV still written
from the successful rows, exit 0. The `degraded` flag design validated itself without being tested
for deliberately.

---

## 2.9 Carried forward

- [ ] All items from §0.6 and §1.6 still open (Firestore rules, key rotation, duplicate projects).
- [ ] **Gemini quota** — see §2.8. Decide before scheduling any demo.
- [ ] **The classifier has never been validated against human judgement.** The confusion matrix
      described in roadmap §4b (hand-label ~50 wrong answers, compare) is the single most important
      remaining piece of evidence and cannot be produced without real session data. Until then, the
      honest claim is "a classifier with a stated confidence model", not "an accurate classifier".
- [ ] `should_represent` fires only on `COMPREHENSION_BARRIER`. Whether `PROCESSING_DELAY` should
      also trigger something (more time? a hint?) is an open design question.
- [ ] `PATTERN` is weighted 0.20 in the autism profile but has no data source — the highest-weight
      missing parameter in the system. It needs pattern-structured item types, which is Track C work.
- [ ] Closed-loop recovery is measured per session but not yet aggregated across students. Phase 4.
- [ ] `attentionLapseCredit` (0.75) and `representThreshold` (0.45) are both unvalidated constants.
      They are in config and should be named as assumptions in the paper.

---

## 2.10 Transferable learnings (cumulative)

13. **A rationale is not an implementation.** Every DASE profile carried a paragraph explaining it
    avoided penalising the disability; the ADHD weights did the opposite of their own stated
    rationale. Only running the numbers caught it.
14. **Build the evidence table during the phase, not at write-up.** The ablation existed to support
    the paper and instead caught a discrimination bug before it shipped.
15. **Report ambiguity instead of resolving it by guessing.** When two labels are indistinguishable
    on the available signals, say so — a fabricated 50/50 split would have looked more confident and
    been worth less.
16. **Exclude a measure from scoring when severity of the condition mechanically lowers it.**
    Measuring it is fine and useful; scoring it penalises the student for their disability.
17. **Profiles should converge on clear cases and diverge on ambiguous ones.** The control archetype
    varying by only 0.044 across 13 profiles, while the struggling learner varies by 0.234, is
    evidence the weighting is doing something sensible rather than something arbitrary.

---

# Phase 3 — Blind and low-vision support

**Status:** Complete (NVDA validation outstanding — see §3.7)
**Goal:** Make the platform usable without sight, and switch on the two DASE
parameters the blind profile has declared but could not measure since Phase 2.

---

## 3.1 What the problem actually was

Before this phase a blind student could not use EduEase at all. Not "with difficulty" — at all:

- Quiz options are radio inputs. **There was no way to answer a question without a pointer.**
- No skip link, so a keyboard user tabbed through the whole nav bar on every page.
- No landmarks, no `aria-current`, no visible focus ring.
- Images in uploaded PDFs were invisible — not described, not even announced as existing.
- The DASE blind profile declared `VOICE_Q` and `NAV_EFF` but neither had a data source, so blind
  students were scored at **52.6% coverage** — barely half the profile written for them.

---

## 3.2 What we built

| File | Purpose |
|---|---|
| `backend/services/intent.py` | Rule-first intent matching, LLM fallback |
| `backend/routers/voice_intent.py` | `/api/voice/intent`, `/api/voice/commands` |
| `backend/services/image_describer.py` | Educational image explanations via Gemini Vision |
| `frontend/src/services/speech.ts` | STT, TTS, Web Audio cues — all native, no dependency |
| `frontend/src/services/voiceIntents.ts` | Client-side rule matching + spoken page descriptions |
| `frontend/src/components/VoiceNavigator.tsx` | The global voice layer |
| `frontend/src/hooks/useVoiceCommand.ts` | Page-local command subscription |
| `models/schemas.py` | `VoiceEvent` (additive to the frozen contract) |
| `services/dase_engine.py` | `VOICE_Q` and `NAV_EFF` computation |

### Rules first, LLM last

The single most consequential design decision in this phase. Every voice command is matched against
regex rules locally; the LLM is only consulted when the rules miss. Three reasons, in order of
importance:

1. **Latency.** A blind student saying "stop" while the page is talking must be obeyed *now*. A
   network round-trip per utterance is the wrong latency for what is, for them, the only input method.
2. **Quota.** The Gemini free tier is 5 requests/minute (see §2.8). A voice layer calling the LLM per
   utterance would exhaust the daily quota in roughly four minutes of use.
3. **Safety.** Regex cannot hallucinate a navigation target. An LLM can, and sending a blind student
   to an unexpected page is disorienting in a way it simply is not for a sighted user who can glance
   at the screen and recover.

Measured: **21 of 21 core commands resolve on rules alone. Zero LLM calls.**

### Answering a quiz by voice

The part that actually unblocks the use case. `"answer B"`, `"choose the second one"`,
`"option 3"`, or a bare `"b"` all select an option — 10 phrasings tested. The selection is then
**read back** (`"Selected B. Chlorophyll reflects green light. Say submit to confirm."`) because a
blind student otherwise has no way to know whether speech recognition heard the option they meant.

### Audio cues before speech

State changes are signalled with Web Audio tones before any words: rising two-tone = microphone open,
falling = not understood. A spoken "I am listening now" would itself take a second, during which the
student does not know whether to start talking.

### Spoken page orientation

Arriving on a page announces a **short** summary ("Quiz page."). Saying "what's on this page" gives
the long one, including what can be done there. Splitting these matters: a long announcement fired on
every navigation is actively hostile, and the research doc's "where am I?" problem is not solved by
talking more.

---

## 3.3 The duplication we chose on purpose

`intent.py` (Python) and `voiceIntents.ts` (TypeScript) implement the same rules twice.

This is exactly the dual-implementation drift risk we flagged and avoided during Phase 2. Here we
accepted it, because the alternative — a network round-trip before "stop" is honoured — is worse for
the user this phase exists to serve.

The cost is managed rather than ignored: `test_phase3.py::test_frontend_and_backend_rules_have_not_drifted`
parses **both files** and fails the build if the intent sets or route tables diverge. It currently
verifies 14 intents and 6 routes match across both.

> **Learning #18 — Duplication is a decision, not an accident, when you name the reason and guard it.**
> The Phase 2 instinct ("one implementation, always") was right for a scoring formula and wrong here.
> What made it acceptable was writing down why, and adding a test that fails when the two drift.

A second test checks that every voice destination actually exists as a route in `App.tsx` — a
mistyped path would drop a blind student on a blank page with no way to work out what happened.

---

## 3.4 The DASE payoff

`VOICE_Q` and `NAV_EFF` now compute from `VoiceEvent` telemetry:

- **`VOICE_Q`** — understood-on-first-try rate, blended with browser STT confidence when reported,
  penalised by repeats.
- **`NAV_EFF`** — time from utterance to completed action against a 4-second target, scaled by the
  understood rate (a command that was never understood still cost the student time).

Blind profile coverage: **0.526 → 0.842.** The profile written for blind students now actually
measures most of what it claims to.

Both parameters **measure the interface, not the student**. A low `VOICE_Q` means our recogniser and
rules failed them. This is written into the function docstring because it will end up on a teacher
dashboard in Phase 4, and phrasing it as a student deficit would be a straightforward misreading of
what the number is.

`ATT_SPAN` remains excluded from the blind profile — webcam attention tracking is meaningless for a
blind student, and this is now pinned by a test rather than left to the config being right.

---

## 3.5 Image descriptions, not alt-text

The research gap (doc §2): vision models produce *alt-text* — "a diagram with arrows and boxes" —
which tells a blind student an image exists without telling them what it teaches.

The prompt asks for the teaching content instead:

> Bad: "A diagram with arrows between labelled boxes."
> Good: "This shows the water cycle as four stages. Water evaporates from the sea, forms clouds,
> falls as rain, and flows back to the sea."

Three implementation decisions worth recording:

- **PyPDF2's `page.images`, not `pdf2image`.** pdf2image needs poppler installed system-wide, which
  is a real setup failure on Windows and would have broken the project for the whole team. PyPDF2 is
  already a dependency.
- **Images under 8KB are skipped.** They are almost always logos, bullets and borders; describing
  them wastes quota and buries real content in noise.
- **A failed description is announced, never omitted.** If Gemini is unavailable the student hears
  "There is an image on page 4 that could not be described automatically." Silently dropping it would
  leave them unaware that content exists which they cannot reach — worse than admitting the failure.

Opt-in via a `describeImages` flag set from the profile, because each image costs one Gemini call.

---

## 3.6 Accessibility baseline

The voice layer sits on top of this; without it the voice layer is a demo, not a product.

- Skip link to `#main-content`, visible on focus.
- `<main>` landmark with `tabIndex={-1}`, `aria-label` on nav, `aria-current="page"` on the active link.
- Visible `focus-visible` rings on navigation.
- 44x44px minimum targets throughout (also covers motor disability, research doc §4.E).
- `aria-live="assertive"` region mirroring every spoken message, so students running their **own**
  screen reader (NVDA, JAWS) get the same information when our TTS is off.

That last point is the answer to plan doc Q2, implemented: we did not choose between "build a voice
layer" and "be screen-reader compatible". A voice navigator on a page NVDA cannot parse is a demo.

Escape always silences. `Ctrl+Shift+V` is push-to-talk.

**Hands-free is opt-in, not the default.** An always-open microphone is a privacy cost and a battery
cost, and it is not ours to impose by default — even on the users who benefit most from it.

---

## 3.7 Verification

```
backend:   python test_phase3.py   -> 10/10 PASS
backend:   test_phase0 / 1 / 2     -> 5/5, 7/7, 14/14 PASS (no regression)
frontend:  npm run build           -> built in 5.13s
```

Notable coverage: 21 core commands on rules alone, 10 answer phrasings, STOP priority, UNKNOWN never
guessing a destination, route existence, cross-file drift, voice parameters feeding DASE, and image
failures being announced rather than hidden.

### Outstanding — and it is the important one

**No screen reader has been run against this yet.** Everything above is verified by unit tests and
reasoning, and neither of those can tell you that a real NVDA user can complete a lesson. The
blindfolded navigation task in the usability study (roadmap §4b) is what validates this phase, and
until it runs the honest claim is "built to be accessible", not "verified accessible".

Specific things only a real run will reveal: whether our `aria-live` announcements collide with
NVDA's own speech, whether the focus order makes sense after a voice navigation, and whether the
audio cues are distinguishable to someone who has not just designed them.

---

## 3.8 Carried forward

- [ ] All items from §0.6, §1.6, §2.9 remain open — including the **Gemini quota decision**, which
      Phase 3 makes more urgent: image descriptions are additional calls per upload.
- [ ] **NVDA / JAWS testing.** The single highest-value remaining task for this track.
- [ ] `SpeechRecognition` is Chrome/Edge only. Firefox and Safari users get a clear message and
      keyboard navigation, but no voice. Worth stating in the paper rather than discovering in a demo.
- [ ] Browser STT sends audio to a cloud service (Google, for Chrome). This is a privacy fact the
      consent screen does not currently mention. It should, before any real user testing.
- [ ] Image descriptions are generated but the Learning page does not yet read them at the right
      point in the text — currently they are returned with the upload and not surfaced.
- [ ] `PAGE_SUMMARIES` is hardcoded per route. Fine for 6 pages, needs generating if the app grows.
- [ ] Voice events use a synthetic `voice-{uid}` session id rather than joining the real learning
      session. Works for parameter computation; Phase 4 may want them properly correlated.
- [ ] `_NAV_TARGET_MS` (4000) is an unvalidated constant, like `attentionLapseCredit`. Name it as an
      assumption in the paper.

---

## 3.9 Transferable learnings (cumulative)

18. **Duplication is a decision, not an accident, when you name the reason and guard it.** One
    implementation is the right default; latency for a user with no alternative input method is a
    good enough reason to break it, provided a test fails when the copies drift.
19. **Rules beat an LLM for a closed command set.** Faster, free, and incapable of hallucinating a
    destination. 21/21 commands matched without a single model call.
20. **Confirm what you heard before acting on it.** Reading the selected option back is the only way
    a blind student can catch a speech-recognition error before it becomes a wrong answer.
21. **Signal state with sound before words.** A tone is instant; "I am listening now" costs a second
    during which the user does not know whether to speak.
22. **Announce failures to the people who cannot see them.** A silently dropped image description
    leaves a blind student unaware that content exists at all.
23. **Parameters that measure the interface must be labelled as such.** `VOICE_Q` is a score for our
    recogniser, not for the student, and it is heading to a teacher dashboard where that distinction
    will not be obvious unless we make it.

---

# Phase 4 — Teacher dashboard on real data

**Status:** Complete
**Goal:** Delete the mock array and replace it with the DASE profiles, error-cause breakdowns and
recommendations that Phases 2-3 now actually produce.

---

## 4.1 What the problem actually was

`TeacherDashboardPage.tsx` was three hardcoded student objects — fixed names, fixed quiz-score
arrays, fixed "focus scores" — with no code path to real data at all. It could not have shown a
DASE score if one existed, because nothing on the page read from Firestore. Every chart rendered
literals.

This was flagged in the original roadmap triage as the highest-risk handoff in the whole project:
it cannot be built until Phase 2 emits real scores, so it was the one track that had to wait.

---

## 4.2 What we built

| File | Purpose |
|---|---|
| `backend/routers/analytics.py` | Roster, per-student detail, class aggregates, AI recommendations |
| `frontend/src/services/analyticsApi.ts` | Typed client for the four endpoints |
| `frontend/src/components/DASERadarChart.tsx` | Per-student parameter radar (Recharts, no new dep) |
| `frontend/src/components/ErrorClassificationChart.tsx` | Error-cause pie chart with confidence |
| `frontend/src/pages/TeacherDashboardPage.tsx` | Rebuilt on real data, mock array deleted |
| `backend/test_phase4.py` | 7 checks |

**Analytics computes nothing new about scoring.** Every number on this dashboard is read from what
`dase_engine.py` already wrote to `evaluations/*`. The router aggregates and presents; it does not
reimplement DASE math. One place owns "what a score means" — if the dashboard also computed scores,
the two could quietly drift apart, and a teacher-facing number would be the one nobody remembers to
keep in sync.

### Null is not zero, three separate places

This is the single idea repeated hardest in this phase, because getting it wrong here has the
worst consequence in the whole project: it would show a student who has never taken a quiz as
**failing**, rather than **unmeasured**.

- **Roster:** `daseScore: null` for a student with no evaluation, rendered as "—", not "0%".
- **Class average:** computed only over `scored` students. Folding an unscored student in as 0 would
  drag the whole class average down by exactly how many students hadn't gotten around to a quiz —
  a data-completeness artefact disguised as a performance signal.
- **Coverage:** shown next to every score, because a 70% DASE score at 35% coverage and a 70% score
  at 95% coverage are different claims, and only one of them deserves confidence.

`test_class_average_excludes_unscored_students` pins the second one directly: three students, one
unscored, and the test asserts the average is computed over exactly two.

### The radar chart shows the profile, not the composite

Deliberately: the dashboard's headline visual is ten (or fewer) individual parameters, with the
single DASE number appearing only as supporting text below it. Roadmap §2.4 says "profile first,
one composite second, and state plainly it is a learning-support signal, not an achievement
measure" — a dashboard whose biggest number is the composite would undercut that on sight,
regardless of what the surrounding prose says.

**`diagnosticOnly` parameters render on the same chart, visually distinguished, with a caption
explaining they are measured but not scored.** This is the Phase 2 ablation fix reaching the UI:
`ATT_SPAN` for an ADHD student is genuinely useful context for a teacher ("this student's attention
span is low") without being allowed to lower their score for having ADHD. Hiding it entirely would
throw away real information; scoring it would repeat the bug that §2.4 fixed.

### The error chart shows confidence, not just counts

A `KNOWLEDGE_GAP` fallback from thin classifier evidence (confidence ~0.3, per
`test_ambiguity_is_admitted_not_invented` in Phase 2) sits in the same pie as a confident
`PROCESSING_DELAY` call unless the difference is visible somewhere. It's in the tooltip: hovering a
slice shows the mean confidence for that cause. A teacher glancing at the chart sees the honest
shape of the data; one who hovers sees how much to trust each slice.

### Recommendations are cached per evaluation, not per page load

`backend/routers/analytics.py::get_recommendation` keys its Firestore cache on
`f"{studentId}_{computedAt}"`. A dashboard reload is a cache hit; a new evaluation produces a new
key and therefore a fresh recommendation. This mattered concretely once the Phase 2 quota problem
was on the table — an uncached recommendation panel opened by three teachers browsing the same
student would have been three Gemini calls for identical output, on a 5-request-per-minute budget.

A degraded (LLM-unavailable) result is explicitly **not** written to the cache
(`test_recommendation_degrades_honestly_on_llm_failure` checks `set.assert_not_called()`). Caching a
placeholder "AI recommendations are temporarily unavailable" message would make that placeholder
permanent for that evaluation even after Gemini recovered.

---

## 4.3 The one thing this phase revealed rather than fixed

**There is no class or section model.** `get_roster()` returns every account with
`role == "student"` in the entire Firestore project — a `teacher_id` parameter exists on the
endpoint but does nothing. For a demo with one class this is invisible. For anything real, a
teacher sees every student in the deployment, not their own.

This was not silently ignored — it's called out in the router's own docstring and in Carried
Forward below — but it is worth being explicit that Phase 4 built the *analytics* layer correctly
without building the *access control* layer at all. Those are different problems, and only one of
them is solved here.

> **Learning #24 — Building the read path correctly is not the same as building the access-control
> path.** A dashboard that computes honest, null-safe, well-labelled statistics over the WRONG set
> of students is still wrong, just wrong in a way none of this phase's tests can catch — they all
> assume the roster function returns the right people. The tests for the numbers say nothing about
> whether the numbers belong to the teacher looking at them.

---

## 4.4 Before / after

| | Before | After |
|---|---|---|
| Data source | Three hardcoded objects | `evaluations/*`, `sessions/*`, `users/*` via Phase 0-2 |
| Unscored student | Not representable | `null`, rendered as "—", excluded from averages |
| Chart | Single "focus %" pie, invented number | DASE radar (real parameters) + error-cause pie (real classifications) |
| Comparability across disabilities | Implied by one number | Explicit caption: each profile scored on its own weighting, bars not a ranking |
| Recommendations | Did not exist | LLM-generated, grounded in real parameters, cached per evaluation |
| Export | None | CSV, roadmap 4.5 |
| Class/section scoping | N/A (fake data) | **Missing** — flagged, not solved (§4.3) |

---

## 4.5 Verification

```
backend:   python test_phase4.py             -> 7/7 PASS
backend:   test_phase0/1/2/3                  -> 5/7/14/10 PASS (no regression)
frontend:  npx tsc --noEmit                   -> exit 0
frontend:  npm run build                      -> built in 3.90s
```

`test_class_endpoint_reuses_roster_not_a_second_query_pass` inspects the source of
`get_class_aggregates` rather than mocking Firestore, specifically to guard against a future edit
re-introducing a second full roster query — the kind of regression that would work fine in a demo
with three students and quietly double Firestore reads at any real scale.

---

## 4.6 Carried forward

- [ ] **No class/section model** (§4.3) — the most consequential gap from this phase. Needs a
      `classes/{id}` collection with a teacher→student roster before this dashboard is safe to show
      more than one teacher.
- [ ] All items from §0.6, §1.6, §2.9, §3.8 remain open.
- [ ] The roster does two Firestore reads per student (evaluations, then sessions) — fine at demo
      scale, will need a denormalised summary document per student if the roster ever exceeds ~50.
- [ ] Trend chart needs 2+ evaluations to render; most Phase 4 demo accounts will show it empty
      until a script seeds a few sessions. Worth a seed script before any live walkthrough.
- [ ] `PATTERN` (autism's highest-weighted parameter at 0.20) still has no data source — flagged
      already in Phase 2, now visible on this dashboard as a permanently-empty radar spoke for
      autistic students specifically.

---

## 4.7 Transferable learnings (cumulative)

24. **Building the read path correctly is not the same as building the access-control path.**
    Correct, null-safe, honestly-labelled statistics over the wrong set of students are still wrong
    — and the kind of tests that verify the numbers cannot verify who the numbers belong to.

---

# Phase 5.3 — Accessible notifications (deaf/hard-of-hearing)

**Status:** Complete (5.3 only — 5.1 was free from Phase 1, 5.2/5.4 still ahead)
**Goal:** Give every audio-only signal in the app a visual/haptic twin, and retrofit the Phase 3
voice layer, which was previously silently unusable for a deaf student.

## What the problem actually was

`VoiceNavigator.tsx` (Phase 3) is entirely audio: Web Audio tones for state changes, TTS for every
response. A deaf student cannot hear "listening…", cannot hear "Selected B, say submit to confirm,"
cannot hear anything it does. It wasn't degraded for them — it was **completely unusable**, with zero
visual fallback. `LearningPage.tsx` also still had one `alert()`, invisible-to-none but blocking and
unstyleable regardless of who hits it.

## What was built

- `services/notify.ts` — a `notify()` call any code can fire (same decoupled pattern as
  `voice:command` events), rendering as a toast with modality decided per-viewer: deaf/hard-of-hearing
  get a full-viewport border pulse + vibration, everyone else gets a plain toast, TTS-enabled viewers
  get it spoken too — unless `silent: true`.
- `components/AccessibleNotification.tsx` — mounted once in `App.tsx`, the only thing that renders it.
- `services/speech.ts::announce()` — `speak() + notify(..., {silent:true})` in one call, so a single
  rename covers the common case without double-speaking.
- Retrofitted all **6** `playCue()` sites in `VoiceNavigator.tsx` with a paired caption — the two with
  no spoken text (`listening`, `thinking`) get a direct `notify()`; the rest route through `say()`,
  which now calls `announce()` instead of raw `speak()`.
- Converted **11** raw `speak()` call sites across `QuizPage.tsx` and `LearningPage.tsx` (the
  page-local voice-command handlers for answer selection, read-next, etc.) to `announce()` — these
  bypass `VoiceNavigator` entirely, so they'd been invisible to deaf users even after fixing the
  navigator itself.
- Replaced the last `alert()`.

## The thing worth remembering

Fixing `VoiceNavigator.tsx` alone would have looked complete and still left a deaf student getting
zero feedback the moment they answered a quiz question by voice — because `QuizPage`'s own
`useVoiceCommand` handler spoke its confirmation directly, never touching the navigator. **The audio
gap was two layers deep, not one**, and grepping for `speak(` across the whole `pages/` directory
(not just the component that seemed responsible) is what surfaced the second layer.

> **Learning #25 — A retrofit that only touches the component you started from will miss every place
> that bypassed it on purpose.** `QuizPage` and `LearningPage` call `speak()` directly precisely
> because `VoiceNavigator` is deliberately unaware of page-local state (documented in Phase 3 as a
> clean separation of concerns). That same separation meant fixing the navigator fixed nothing for
> in-quiz voice interaction. Grep for the underlying primitive across the whole tree, not just the
> file that owns the abstraction around it.

## Verification

```
test_phase5.py   7/7 PASS   (static source checks — no frontend test runner exists)
test_phase0-4    all PASS (no regression)
tsc --noEmit     clean
npm run build    3.43s
```

One test bug worth noting: the self-check's own regex for "no `alert()` remains" initially failed
against my own explanatory code comment (`// Was alert() — blocking...`), which contains the literal
string. Fixed by stripping `//` comments before matching. A test that can't tell code from a comment
about the code is a bug in the test, caught by the test itself failing correctly on real input.

## Carried forward

- [ ] 5.2 (Mermaid visual generator) and 5.4 (captions on TTS + simplified transcript) still ahead.
- [ ] All prior open items (§0.6, §1.6, §2.9, §3.8, §4.6) remain.
- [ ] `notify()`'s vibration durations/patterns are unvalidated guesses, like `attentionLapseCredit`
      — name as an assumption if it reaches the paper.

---

# Phase 5.2 — Visual summary generator (Mermaid diagrams + concept cards)

**Status:** Complete
**Goal:** Convert a lesson into a diagram + icon concept cards for deaf-first learning, without the
cost blowing up the way the Gemini quota problem (§2.8) already showed it could.

## The cost conversation that shaped this

Before writing any code, the user pushed back directly: adding LLM calls for diagrams risks eating
the same quota that's already tight (§2.8, §5-groq). That pushback changed the design, not just the
messaging:

- **On-demand, not automatic.** The diagram only generates when a student clicks "Show visual
  summary" — never fires on lesson load. Confirmed via `AskUserQuestion` rather than assumed.
- **One call per lesson, not per feature-richness.** The diagram AND the concept cards come back from
  a SINGLE `call_json`, not two separate calls. Cheaper, and also means the two are guaranteed
  consistent with each other.
- **Cached on `(text, profile)`**, identical to simplify/quiz-gen — one unique lesson costs one call,
  ever, regardless of how many students view it. This was already true of the existing pipeline; it
  just needed pointing out, since the demonstrated quota pain was from repeated dev-testing of many
  different texts, not from what real classroom usage would cost.
- **Groq fallback applies automatically** — no special wiring needed, `visual_generator.py` goes
  through the same `call_json` as everything else.

## What was built

| File | Purpose |
|---|---|
| `backend/services/visual_generator.py` | One call → Mermaid diagram + 3-6 concept cards |
| `backend/routers/content.py` | `POST /api/visual-summary/` |
| `frontend/src/components/VisualSummary.tsx` | Button-triggered fetch, renders Mermaid client-side |
| `frontend/src/pages/LearningPage.tsx` | Wired in, gated to `deaf`/`hard_of_hearing` profiles |
| `backend/test_phase5_2.py` | 11 checks |

### Sanitizing model output before it becomes a diagram

The prompt can ask for valid Mermaid syntax, but nothing guarantees the model returns it.
`_sanitize_diagram()` rejects anything that doesn't start with a real Mermaid directive
(`flowchart`/`graph`/`mindmap`) and anything implausibly long (a real 10-node diagram is nowhere
near 40 lines — a runaway response gets caught here rather than rendered as visual noise). A
rejected diagram degrades to **concept cards only**, not a blank panel and not a broken render —
tested directly in `test_normalise_drops_diagram_on_sanitize_failure_but_keeps_concepts`.

## The bundle-size regression this caught mid-build

This is the most useful thing that happened in this sub-phase, and it wasn't about tokens at all.

First build after adding `mermaid`:

```
index-*.js   1,245.91 kB  ->  1,914.01 kB   (gzip 344 kB -> 507 kB)
```

**The main JavaScript bundle grew by 670KB, for every single user, on every single page, including
students who will never see the deaf-support feature at all.** `VisualSummary.tsx` was statically
imported by `LearningPage.tsx`, and this app has no route-based code-splitting anywhere else, so
mermaid's core plus its diagram-layout sub-renderers (elk, cytoscape, katex — mermaid pulls these in
for diagram types this feature doesn't even use) all landed in the one bundle every visitor downloads
before anything renders.

Fixed with `React.lazy(() => import('../components/VisualSummary'))` + `Suspense`. Rebuilt:

```
index-*.js            1,245.91 kB   (back to baseline — matches pre-mermaid Phase 5.3 build)
VisualSummary-*.js       664.57 kB   (lazy chunk — deaf/hoh students only)
elk-*.js                1,467.78 kB   (lazy chunk, further split — only if that diagram type is used)
```

The nearly 2.5MB mermaid brings in now downloads only for the ~one profile group it serves, and only
once they reach the Learning page — not for every visitor of every page.

> **Learning #26 — A dependency cost isn't only API calls.** The user's concern was framed around
> LLM token/rate limits, and that concern was real and correctly addressed (on-demand, cached,
> single-call). But the bigger, silent cost of this feature turned out to be client bundle weight —
> a cost paid by every user, on every page load, whether or not they ever touch the feature — and it
> would have shipped unnoticed if the build output hadn't been read line by line after `npm install`.
> Any new frontend dependency needs the same question asked twice: what does this cost the SERVER
> per use, and what does this cost EVERY CLIENT just by existing in the bundle. React.lazy() answers
> the second question the same way caching answers the first: pay only when actually used.

## Verification

```
backend:   python test_phase5_2.py    -> 11/11 PASS
frontend:  npx tsc --noEmit           -> clean
frontend:  npm run build              -> main bundle back to 1.24MB, mermaid fully lazy-split
```

One test-hygiene bug worth recording: `test_cached_on_text_and_profile_one_call_per_unique_lesson`
initially didn't mock `cache.db`, so its first run made a REAL Gemini call and wrote a real Firestore
cache entry. Re-running the test file a second time then found that persisted entry and never
invoked the mock at all — 0 calls recorded, yet the assertion nearly passed by coincidence because
the cached shape matched what the mock would have returned. Fixed by patching `cache.db = None`
(the established pattern from `test_phase1.py::test_cache_computes_once`) and using a per-run-unique
cache key so a stray future re-run can't collide either. **Left behind:** one harmless stray document
in the real `visual_summary_cache` Firestore collection from that first buggy run (fake test data,
`{title: "X", explanation: "Y"}`) — not deleted without being asked; safe to remove manually or leave.

## Carried forward

- [ ] 5.4 was folded into 5.3 (see that section) — TTS captions already exist via `announce()`.
      Phase 5 is now functionally complete except for cleanup polish.
- [ ] All prior open items (§0.6, §1.6, §2.9, §3.8, §4.6, Phase 5.3's carried-forward) remain.
- [ ] The stray Firestore test document noted above.
- [ ] `mermaid`'s `securityLevel: 'strict'` is relied on to sanitize the SVG before
      `dangerouslySetInnerHTML` — this is mermaid's own documented sanitization, not something this
      project re-verifies. Worth a second look before any external-facing deployment.
- [ ] The visual-summary button is gated to `deaf`/`hard_of_hearing` profiles only. Whether other
      visual learners (e.g. autism, intellectual disability) would also benefit is a real question
      the roadmap didn't settle — noted, not decided.

## Transferable learnings (cumulative)

26. **A dependency's cost isn't only what it charges an API.** Ask what it costs the server per call
    AND what it costs every client just by being in the bundle — and check the second one by actually
    reading the build output, not by assuming a "one new dependency" is automatically cheap.

---

# Phase 6 — UI/design consistency pass

**Status:** Complete
**Goal:** Consistent, professional icons everywhere; fix the PDF-upload page's whitespace; sweep the
whole app for design-principle violations, not just the two things named directly.

## The request behind the request

The literal ask was icons plus fixing one page's whitespace. Taken as a careful colleague would,
"keeping all software engineering design principles in mind" meant something more specific than
"make it pretty": a single source of truth for the palette (not 8 colors named ad-hoc across 15
files), and an actual audit rather than a decorative pass. That reframing is what turned this from an
icon-sprinkling task into finding and fixing eight real, previously invisible bugs.

## What was built

| File | Purpose |
|---|---|
| `tailwind.config.js` | Semantic color tokens (primary/success/warning/danger) — one definition, not 15 |
| `src/index.css` | CSS backing for accessibility toggle classes (see below — this did nothing before) |
| `src/pages/SettingsPage.tsx` | Every Phase 0 profile pref, now actually reachable after signup |
| `src/components/Layout.tsx` | Icons on nav, mobile menu (there was none), Settings link |
| `AccessibleNotification.tsx`, `VoiceNavigator.tsx`, `Chatbot.tsx`, `AuthForm.tsx`, `Eye.tsx`, `UploadForm.tsx`, `ContentForm.tsx`, `DashboardPage.tsx`, `TeacherDashboardPage.tsx`, `QuizPage.tsx`, `LearningPage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `RoleGate.tsx`, `UploadPage.tsx`, `ContentPage.tsx` | Icon pass, token migration, or both |
| `backend/test_phase6.py` | 10 checks pinning the real bugs below |

`lucide-react` installed (the roadmap's own choice, one dependency). No new abstraction layer for
icons — they are imported directly at call sites, since lucide's API is already consistent (same
stroke width, same sizing) and a wrapper component would have been unrequested abstraction over a
library that does not need one.

## Token migration — behavior-preserving, not a repaint

Before touching anything, checked whether the semantic tokens wanted
(`primary`/`success`/`warning`/`danger`) were byte-identical to the Tailwind colors already in use
(`indigo`/`emerald`/`amber`/`rose`). They were, by design — the same hex values were chosen
deliberately. That turned a mechanical rename across 11 files into a pure maintainability
improvement with zero visual change, verified before running rather than assumed:

```
primary-600 = #4f46e5 = indigo-600     success-500 = #10b981 = emerald-500
danger-600  = #e11d48 = rose-600       warning-600 = #d97706 = amber-600
```

92 renames across 11 files, plus a second pass catching `gray-*` (a genuinely different, unrelated
neutral scale from the `slate-*` used everywhere else) and stray `blue-*` buttons that predated the
app's indigo-based design entirely.

## Eight real bugs found, not cosmetic ones

**1. The accessibility toggles have done nothing since Phase 0.** `applyPrefs()` has toggled
`.high-contrast`, `.dyslexia-font`, `.reduce-motion` and a `--font-scale` CSS variable on
`document.documentElement` since the very first phase. **Zero CSS ever existed for any of them.** A
student turning on "high contrast" or a dyslexia-friendly font in their profile has had that setting
silently swallowed for the entire project, across every phase, until this one. Fixed with real rules
in `index.css`, including swapping the folklore choice (Comic Sans) for **Atkinson Hyperlegible** — a
typeface actually designed by the Braille Institute for low-vision and dyslexic readers, which is
also the more defensible choice for something explicitly requested to look professional.

> **Learning #27 — A preference that changes state but never renders anything is invisible in every
> kind of testing except actually looking at the result.** Unit tests, typechecks, and builds all
> passed through five phases while this did nothing. Only reading the CSS file and asking "where is
> this class actually defined" surfaced it.

**2. `font-scale` would have been a no-op even once CSS existed for it, on the first draft.**
`rem` units are always relative to the root (`html`) element's font-size, never `body`'s — the first
pass wrote `body { font-size: calc(1rem * var(--font-scale)) }`, which does nothing to any Tailwind
`text-*` class. Caught before shipping, fixed to target `html`, and pinned with
`test_font_scale_applies_to_root_not_body` specifically because it is the kind of mistake that looks
correct and silently is not.

**3. No mobile navigation existed at all.** `<nav className="hidden sm:flex">` had no fallback below
the breakpoint — a phone user had no way to navigate except the skip-to-content link. Added a proper
hamburger menu.

**4. Two duplicate "Focus Tracker" headings, stacked directly on top of each other**, in both
`LearningPage` and `QuizPage`. Both pages wrapped `<Eye>` in a card with their own heading text, not
realizing `<Eye>` already renders an identical title in every one of its own render states.

**5. `Chatbot.tsx` never sent `user_id`.** Every signed-in student's conversation fell into the
backend's single `"anonymous"` memory bucket, quietly defeating the per-user isolation Phase 0.4
built specifically because the opposite bug — one shared memory for everyone — was the original
security finding in that phase. The fix regressed itself, silently, three phases later, and nothing
caught it until reading this file end-to-end while adding a send-button icon.

**6. `UploadForm`, `ContentForm`, and `Chatbot` were all hardcoded to `http://localhost:8000`**,
had leftover debug `console.log`/`console.warn` calls, and — in `ContentForm`'s case — three separate
hardcoded URL instances. None of these would work outside local development.

**7. `UploadPage`'s promise of image descriptions was aspirational copy for an untriggerable
feature.** Phase 3 built `image_describer.py` fully; nothing in the frontend ever set
`describeImages` or sent it with an upload, and described images, once generated, were never
rendered anywhere. Closed end-to-end: new `describeImages` pref (additive to `DATA_CONTRACT.md` v1,
backward compatible), a Settings toggle, `UploadForm` sending it, and a new panel on `LearningPage`
that shows and reads aloud every described image — the first time this Phase 3 feature has been
reachable by a user at all.

**8. Quiz voice commands referenced letters ("answer A, B, C or D") that had no visual
counterpart.** `VoiceNavigator`'s own help text told students to say "answer B," but no option on
screen was ever labeled B. Added letter badges to each option.

## The whitespace fix (the literal ask)

`UploadPage.tsx` — the actual PDF-extraction page — was a 448px card centered inside its own
`min-h-screen flex items-center justify-center bg-gray-100`, nested a second time inside Layout's own
`min-h-screen` wrapper, on a background that did not match the rest of the app. On any screen wider
than the card, most of the page was empty gray space. `ContentPage.tsx` had the identical pattern.

Rebuilt `UploadPage` as a two-column layout using the width Layout already provides: a real dropzone
(drag-and-drop, file preview, upload progress) on the left, a "what happens next" panel plus
profile-aware tips on the right. `ContentPage` uses the width directly rather than re-centering.

## The bundle-size discipline carried over from Phase 5.2

Nothing new installed here beyond `lucide-react`, and lucide tree-shakes per-icon by design — the
final bundle grew by ~50KB (1.25MB to 1.30MB) across roughly 15 files gaining icons, proportionate
and expected, confirmed by reading the build output rather than assuming it.

## Verification

```
backend:   python test_phase6.py             -> 10/10 PASS
backend:   test_phase0-5, test_groq_fallback  -> all PASS (no regression)
frontend:  npx tsc --noEmit                   -> clean
frontend:  npm run build                      -> 1.30MB main bundle (was 1.25MB), built in 16.5s
```

One test-hygiene bug caught along the way, twice: `test_phase4.py`'s regression check for
`triggerEvaluation` hardcoded an exact line NUMBER (`split("\n")[7]`) rather than searching for the
import — adding one icon-import line above it shifted every subsequent line down by one and broke
the test. Fixed to search import lines for content, not position. The Phase 6 self-check itself hit
the identical class of bug during its own first run (explanatory code comments mentioning old color
classes like `bg-gray-100` tripped the "no off-palette colors" check) — fixed by stripping comments
before scanning, the same lesson twice in one phase.

## Carried forward

- [ ] All items from prior phases' carried-forward sections remain open.
- [ ] The main bundle (1.30MB) still has no route-based code-splitting beyond `VisualSummary` —
      every page's JS loads on first visit regardless of which page is actually shown.
- [ ] Settings page prefs save individually per-toggle (one Firestore write each) rather than
      batched — fine at this scale, would want debouncing if prefs grow much further.
- [ ] Atkinson Hyperlegible and Poppins are both loaded from Google Fonts at runtime — no
      self-hosting or fallback story for a fully offline demo.
- [ ] The token migration covered `.tsx` files; any inline styles or CSS-in-JS elsewhere were not
      audited (none were found, but the sweep specifically targeted className strings).

## Transferable learnings (cumulative)

27. **A preference that changes state but renders nothing is invisible to every kind of testing
    except reading the result.** Five phases of passing tests and builds coexisted with an
    accessibility feature that had done nothing since the day it was written.
28. **Verify a token migration is behavior-preserving BEFORE running it, not after.** Confirming the
    new semantic color values matched the old raw ones byte-for-byte turned a risky 92-line diff into
    a safe one.
29. **A security fix can regress silently in a later, unrelated phase.** The one exact bug Phase 0.4
    existed to fix (shared memory across users) came back three phases later because a new component
    never learned about the pattern that fixed it the first time. Grep for the shape of a fixed bug
    when touching adjacent code, not just for the specific line that was fixed.
30. **A test that pins an exact line number is pinning coincidence, not the thing you meant to
    test.** Search file content for what you are actually verifying; never assume where in the file
    it lives.
