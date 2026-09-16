# Branch Comparison: `master` vs `main`

Feature-by-feature comparison, built by actually reading both branches' code — not commit messages.
For each row: what each branch has, and a recommendation where one side is clearly stronger. Where
it's a real trade-off, both sides are described honestly and the call is left to you.

**Decision column is blank on purpose.** Fill in ✅ next to whichever side wins each row as you and
your teammate go through it. That becomes the integration checklist.

---

## 1. Authentication & authorization

| | `master` | `main` |
|---|---|---|
| Backend verifies who's calling | **No.** No endpoint checks a Firebase token at all — anyone who knows the URL can call any endpoint as anyone. | **Yes.** Every endpoint requires a verified Firebase ID token (`verify_firebase_token`, Google's public signing keys) via a `Depends(verify_user)` dependency. |
| Role enforcement | Frontend-only (`RoleGate.tsx` redirects, but nothing stops a direct API call) | Backend-enforced (`verify_role("teacher")`, `verify_role("admin")`), with auto-provisioning on first login |
| Admin role | Doesn't exist | Full admin role: create users, list all users, seed demo data |
| Frontend → backend token attach | Manual per-call | Automatic via an axios interceptor (`api.ts`) that waits for Firebase auth to be ready and attaches `Authorization: Bearer <token>` to every request |

**Recommendation: `main` wins outright.** This isn't a style difference — `master` has no real
backend authorization at all. Every write endpoint (`/api/simplify-text/`, `/api/generate-quiz/`,
`/api/add-content/`) is callable by anyone with the URL. This is the single most important thing to
adopt from `main` before this app goes anywhere near real students. Decision: [ ]

---

## 2. Chatbot: retrieval and safety

| | `master` | `main` |
|---|---|---|
| Answers grounded in uploaded content? | No — plain `ConversationChain`, no retrieval at all | **Yes — real RAG.** Parent-document retriever: 600-char child chunks for precise search, 3200-char parent chunks returned for context, FAISS vector store persisted to disk, cross-encoder reranking (`BAAI/bge-reranker-base`) on top-12 candidates before returning top-4 |
| Per-user session isolation | Fixed (Phase 0.4 of this session — was a real bug, now an LRU-capped dict keyed by uid) | TTLCache keyed by `session_id`, 1hr expiry, thread-locked |
| Prompt injection defense | None | Regex-based: catches "ignore previous instructions," "you are now a...," "jailbreak," "DAN," etc. — falls back to a safe canned response |
| PII leakage | None | Strips emails/phone numbers/zip codes from every model output before it reaches the student |
| Output toxicity check | None | Regex catches self-harm/suicide phrasing and abusive language, substitutes a safe fallback |
| Emotional state tracking | None | **Every chat turn** gets a second LLM call scoring frustration 0–1, with a rule-based `suggested_action` (continue / simplify / offer_break) |
| Rate-limit handling | Retries then degrades to spaCy (this session's Phase 2 fix — was a 62-second hang) | Catches 429s explicitly, returns "high demand" message instead of erroring |
| Reading-level personalization | Disability-profile-based (9 profiles: dyslexia/deaf/autism/adhd/etc.) | Grade-level-based (1st–8th grade, explicit max-words-per-sentence per grade) + reading-difficulty hint (easy/medium/hard) |

**This is the closest real trade-off in the whole comparison.** `main`'s RAG + guardrails are
genuinely more sophisticated than anything built this session — grounding answers in the actual
uploaded material, and defending against prompt injection and harmful output are both things `master`
doesn't do at all. `master`'s disability-profile personalization (this session's Phase 1) is a
different, **not redundant**, axis — grade-level and disability are orthogonal; a dyslexic 5th-grader
needs both. The honest path is combining them: `main`'s RAG/safety layer, wrapping calls built with
`master`'s disability-aware prompt profiles instead of `main`'s grade-level-only ones (or both, since
they answer different questions). Decision: [ ]

---

## 3. Quiz generation

| | `master` | `main` |
|---|---|---|
| Question types | MCQ only | **Mixed: MCQ, true/false, and fill-in-the-blank**, in a fixed 3/3/3 distribution the prompt enforces |
| Answer-in-options validation | Yes (this session's Phase 1 — rejects a generated item if the answer isn't literally one of the options) | Yes, plus a full-item schema check (verifies all 5 required keys exist, options count, question_type is a known value) |
| Personalization | 9 disability-adapted item formats (no spatial items for blind, matching-style for deaf, etc.) + a simpler-variant of every item for the Phase 2 closed loop | None — same format for everyone |
| Distractor fallback (LLM unavailable) | spaCy fill-in-the-blank | spaCy fill-in-the-blank generating all 3 types (fill_blank/true_false/mcq round-robin) |
| topic/concept tagging | `topic` + `conceptId` per item, feeds "Focus Areas to Improve" and DASE's `COMP` parameter | `topic` per item (standardized academic category), feeds the weak-topics aggregation in teacher analytics |

**Recommendation:** combine — `main`'s three question types with `master`'s disability-adapted item
formats and simpler-variant generation are not in conflict; take both. Decision: [ ]

---

## 4. Eye/gaze tracking

| | `master` | `main` |
|---|---|---|
| Library | WebGazer.js | **MediaPipe FaceLandmarker** (`@mediapipe/tasks-vision`) |
| What it actually measures | Confirmed in this session: only "is a face visible in the last 1.5s" — a presence proxy, not gaze. Named honestly as `focusRatio` throughout this session's telemetry, specifically because it isn't real gaze data. | Real face landmark tracking — has the raw signal to determine actual gaze direction, not just presence |
| Calibration UI | 5-point calibration screen that implies gaze tracking it doesn't deliver (flagged as a carried-forward item in this session's Phase 3 debrief) | Not yet inspected in depth — worth checking whether `main` closes the gap between the calibration UI and what it measures |

**Recommendation: `main`'s MediaPipe wins on capability.** Worth verifying during integration whether
`main` actually computes gaze-on-content from the landmarks or still ultimately reduces to presence —
but MediaPipe is the right foundation either way, and it's what should carry forward. Decision: [ ]

---

## 5. Teacher analytics & the class/section model

| | `master` | `main` |
|---|---|---|
| Teacher sees only their own students | **No — this session's Phase 4 flagged this as the single highest-priority open gap.** `get_roster()` returns every student account in the entire deployment. | **Yes.** Students carry a `teacher_id` field; `/teacher/students` filters by `teacher_id == current teacher's uid`. This is exactly the missing piece. |
| Scoring model | DASE — disability-weighted, 10 measured parameters, error-cause classification (knowledge gap / attention lapse / processing delay / comprehension barrier), a closed loop that re-presents an easier question variant on a comprehension barrier | Generic: quiz score average, focus score average, frustration-trigger count, weak-topic frequency |
| Evidence the scoring differentiates students meaningfully | Yes — `scripts/run_ablation.py`, a reproducible check that the disability-weighted scoring actually changes student rankings (this session's novelty claim) | Not applicable — no disability weighting to validate |
| Visualizations | Per-student DASE radar chart, error-cause pie chart with confidence, score trend line | Focus-score pie/bucket chart, quiz-average bar chart per student, session timeline |
| AI-generated recommendations | Yes, grounded in DASE parameters, cached per evaluation | Not present |
| Demo data | None — real accounts only | Full seed script on startup: 3 teachers, 10 students, 5 quiz + 5 session records each, realistic timestamps |

**Recommendation: take `main`'s `teacher_id` roster model as the fix for `master`'s biggest known
gap, keep `master`'s DASE scoring on top of it.** These aren't competing — `main` solved "which
students does this teacher see," `master` solved "how do we score them well." Put DASE's per-student
computation behind `main`'s per-teacher roster filter. Decision: [ ]

---

## 6. Accessibility for blind/deaf/other disabilities

| | `master` | `main` |
|---|---|---|
| Disability profile on the student account | Yes — 12 types, comorbidity-aware (list, not single enum), severity, drives content adaptation | Not present — `grade_level` and `reading_difficulty` only |
| Voice navigation | Full voice command layer: 21 commands resolved without any LLM call, push-to-talk by default, screen-reader-compatible (ARIA live regions), visual/haptic captions for deaf users | Not present |
| Blind support | Voice-first chatbot mode, Gemini Vision educational image descriptions for PDF images, full keyboard/ARIA pass | Not present |
| Deaf support | On-demand Mermaid diagram + concept-card visual summaries, profile-aware visual/vibration notifications replacing every audio cue | Not present |
| Settings page for accessibility prefs | Yes (this session's Phase 6) — high contrast, dyslexia font (Atkinson Hyperlegible), text scale, TTS rate, voice nav toggle, all backed by real CSS (a real bug found and fixed this session: these prefs existed since Phase 0 with zero CSS behind them) | Not present |

**Recommendation: `master` wins outright — this is the entire point of this session's work, and
`main` doesn't have an equivalent.** Nothing to reconcile here; this whole layer carries forward
as-is on top of whichever backend/auth/RAG foundation you choose from the rows above.

---

## 7. Content upload & limits

| | `master` | `main` |
|---|---|---|
| File size limit | None | 5MB |
| Page count limit | None | 20 pages |
| Upload UI | Rebuilt this session (Phase 6) — real dropzone, drag-and-drop, upload progress, fixed a whitespace bug where the page was a small card floating in empty gray space | Original — a simple file input |
| Image description for blind users | Yes, Gemini Vision, opt-in via profile | Not present |

**Recommendation: take `main`'s size/page limits** (a real gap in `master` — nothing currently stops
someone uploading a 500-page PDF and burning the whole Gemini quota on one request), **keep
`master`'s UI and image-description work.** Decision: [ ]

---

## 8. Firebase project configuration — a bug this comparison actually caught

`main`'s `firebase_config.py` verifies tokens against Firebase project **`eduease-b955c`**
(`_FIREBASE_PROJECT_ID` default). This session's `PHASE_LEARNINGS.md` §0.6 flagged that `master`'s
`frontend/src/services/firebase.ts` hardcodes a **different** project, `ai-learning-app-3025f`, while
`master`'s `frontend/.env` names `eduease-b955c` and is silently unused.

**This confirms `eduease-b955c` is the real, intended shared project** — `main`'s backend already
expects it. When integrating, `master`'s `firebase.ts` needs to be pointed at `eduease-b955c` to
match. This was an open question in this session's carried-forward list; `main`'s code answers it.

---

## 9. Dependencies added

| Dependency | Branch | Purpose |
|---|---|---|
| `faiss-cpu`, `sentence-transformers`, `langchain-community`, `langchain-text-splitters`, `cachetools` | `main` only | RAG pipeline + reranking + session cache |
| `pdf2image`, `groq`, `python-dotenv` | `master` only | (pdf2image unused — flagged already in this session's Phase 3 debrief as a leftover); Groq fallback; env loading |
| `lucide-react`, `mermaid` | `master` only | Icons (Phase 6), deaf visual summaries (Phase 5) |
| `@mediapipe/tasks-vision` | Both — `master` has it installed but `Eye.tsx` still uses WebGazer; `main` actually uses it | — |

Worth checking during integration whether `master`'s unused `@mediapipe/tasks-vision` and `pdf2image`
should just be removed if MediaPipe/RAG land from `main` and make them redundant or replaced.

---

## Summary — what to actually do

Based on the above, the shape of the integration (not a decision, a starting proposal for you and
your teammate to react to):

1. **Take `main` as the base** for backend request handling — real auth, RAG, safety guardrails, the
   teacher-student roster model, upload limits. This matches the earlier call that `main` is the
   branch you've both continued treating as current.
2. **Layer `master`'s disability-adaptive work on top** — the DASE engine, disability profiles, voice
   navigation, blind/deaf support, Settings page, UI/icon pass. None of this conflicts with `main`'s
   auth/RAG layer; it needs `main`'s endpoints wrapped with disability-profile-aware prompts instead
   of (or alongside) `main`'s grade-level-only ones.
3. **Reconcile quiz generation and chatbot prompts** to use both axes — grade level AND disability
   profile — rather than picking one.
4. **Fix the Firebase project mismatch** as part of the merge, pointing `master`'s `firebase.ts` at
   `eduease-b955c`.
5. **DASE scoring sits behind `main`'s teacher_id roster filter**, not `master`'s current
   see-everyone roster.

This is real, multi-file integration work — reconciling `app.py` (backend monolith on `main`) against
`master`'s consolidated `routers/` structure, deciding whether RAG-grounded answers get disability-
adapted phrasing, wiring DASE parameters to read from `main`'s telemetry endpoints or vice versa. Not
something to rush; recommend scoping it as its own set of phases once you and your teammate agree on
the rows above.
