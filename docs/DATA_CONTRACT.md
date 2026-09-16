# EduEase Data Contract — v1 (FROZEN as of Phase 0)

> [!CAUTION]
> **This file is frozen.** Tracks A (blind), B (teacher dashboard) and C (deaf) all read against these
> shapes. Do not change a field name or type unilaterally — it silently breaks another track's code.
> To change something: raise it with all three track owners, bump the version below, and write a
> migration note. Additive changes (new optional field) are fine without ceremony.

**Version:** 1
**Owner:** Phase 0
**Consumers:** `dase_engine.py` (P2), `analytics.py` (P4), all frontend tracks

---

## 1. Firestore layout

```
users/{uid}
  email          string
  role           "student" | "teacher"
  profile        Profile            (see §2)
  consent        Consent            (see §4)
  createdAt      timestamp

sessions/{sessionId}
  studentId      string             (= users/{uid})
  kind           "quiz" | "reading"
  contentId      string | null
  startedAt      timestamp
  endedAt        timestamp | null
  summary        SessionSummary     (see §3.3, written on finish)

sessions/{sessionId}/events/{eventId}
  QuestionEvent | ReadingEvent      (see §3.1, §3.2)

evaluations/{evaluationId}          (written by P2, read by P4)
  studentId, sessionId, computedAt, daseScore, parameters, errorBreakdown

content/{id}                        (main's original content pipeline)
  text, uid

quiz_results/{id}                   (main's original, still read by the
  student_id, teacher_id,            teacher dashboard's score/weak-topics
  score, total_questions,            charts, written by POST /analytics/log-quiz/
  wrong_topics, timestamp            — coarser and older than sessions/events,
                                      kept alongside rather than replaced)

telemetry_sessions/{id}             (as quiz_results — written by
  student_id, teacher_id,            POST /analytics/log-session/)
  session_id, average_focus_score,
  frustration_triggers, timestamp
```

**Why a flat `sessions` collection** rather than nesting under `users/{uid}/sessions`: the teacher
dashboard (P4) queries across all students in a class. A flat collection with a `studentId` field
indexes for that in one query. Nested would need a collection-group query for the same result.

---

## 2. Profile

```ts
type Disability =
  | 'dyslexia' | 'adhd' | 'autism' | 'blind' | 'low_vision'
  | 'deaf' | 'hard_of_hearing' | 'dyscalculia' | 'dysgraphia'
  | 'anxiety' | 'intellectual' | 'motor';

interface Profile {
  disabilities: Disability[];      // [] means no disclosed disability
  primary: Disability | null;      // which profile DASE scores against; null -> 'default'
  severity: 'mild' | 'moderate' | 'significant' | null;
  prefs: {
    fontScale: number;             // 1.0 .. 2.0
    highContrast: boolean;
    dyslexiaFont: boolean;
    reduceMotion: boolean;
    ttsEnabled: boolean;
    ttsRate: number;               // 0.5 .. 2.0
    voiceNav: boolean;             // P3 opt-in, default false
    captionsAlways: boolean;       // P5
    webcamAttention: boolean;      // opt-in, forced false when blind/low_vision
  };
}
```

### Rules that code must honour

- `disabilities` is a **list** — comorbidity is the norm, not the exception (ADHD+dyslexia especially).
- `primary` is what DASE weights against. If `disabilities` has entries but `primary` is null, use
  `disabilities[0]`. If both empty → `default` profile.
- `webcamAttention` must be forced `false` when `blind` or `low_vision` is present (roadmap §3.6), and
  `ATT_SPAN` must then be dropped from the DASE weight set and the remaining weights renormalized.
- A student may decline to disclose. `[]` is a valid, fully-supported state — every feature must work
  without a disability declared. Never gate core functionality on disclosure.

---

## 3. Telemetry events

Every event carries these common fields:

```ts
interface EventBase {
  sessionId: string;
  studentId: string;
  ts: number;          // Date.now(), client clock
  serverTs: timestamp; // set by backend on write — use THIS for ordering
}
```

> Client clocks are unreliable. `ts` is kept for client-side ordering within a burst; anything
> analytical (velocity, trends) must use `serverTs`.

### 3.1 QuestionEvent — the primary DASE input

```ts
interface QuestionEvent extends EventBase {
  type: 'question';
  questionId: string;
  conceptId: string | null;    // groups items by concept, for COMP + re-presentation
  topic: string | null;        // from P1.2 quiz gen
  difficulty: 1|2|3|4|5;
  questionType: string;        // 'mcq' | 'matching' | 'numeric' | ...

  selected: string | null;     // null = skipped / timed out
  correct: boolean;
  timeMs: number;              // first render -> submit
  timeToFirstInteractionMs: number | null;   // -> processing speed

  attempts: number;            // 1 unless re-presented
  answerChanges: number;       // radio switches before submit -> hesitation
  hintsUsed: number;
  revisits: number;            // times navigated back to this question
  reRead: boolean;             // scrolled back up / replayed TTS on the stem

  focusRatio: number | null;   // 0..1, fraction of timeMs with face present. null if webcam off
  focusSamples: number;        // how many samples focusRatio is based on; 0 => untrustworthy

  isRepresentation: boolean;   // true if this is the simpler variant served by the P2.4 closed loop
  originalQuestionId: string | null;
}
```

> [!IMPORTANT]
> `focusRatio` is **face-presence**, not gaze-on-content. `Eye.tsx` only checks whether WebGazer
> returned data in the last 1.5s. Never label it "attention" in a teacher-facing string, and treat
> `focusSamples < 5` as `null`.

### 3.2 ReadingEvent — feeds READ_FL and ATT_SPAN

```ts
interface ReadingEvent extends EventBase {
  type: 'reading';
  contentId: string | null;
  wordsRead: number;
  wpmSetting: number;          // the WPM slider value
  elapsedMs: number;
  replays: number;             // resets / re-reads of a sentence
  ttsUsed: boolean;
  pauseCount: number;
  focusRatio: number | null;
  focusSamples: number;
  simplifyProfile: string;     // which P1.1 profile produced the text read
}
```

### 3.3 SessionSummary

```ts
interface SessionSummary {
  totalQuestions: number;
  correct: number;
  totalTimeMs: number;
  completed: boolean;          // false if abandoned -> feeds TASK_COMP
  meanFocusRatio: number | null;
}
```

---

## 4. Consent

```ts
interface Consent {
  dataCollection: boolean;     // required to use the app
  webcam: boolean;             // separate, revocable, default false
  disabilityDisclosure: boolean;
  grantedAt: timestamp;
  version: number;             // bump when the consent text changes
}
```

Disability data is health-adjacent. `webcam: false` must fully disable `Eye.tsx` and set
`focusRatio: null` everywhere — not merely hide the UI.

---

## 5. API surface (Phase 0)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/events` | `{ events: Event[] }` | Batch. Max 100/call. Idempotent on `(sessionId, questionId, attempts)`. |
| POST | `/api/sessions` | `{ studentId, kind, contentId }` | Returns `{ sessionId }` |
| PATCH | `/api/sessions/{id}` | `{ summary }` | Written on finish |

Legacy root paths (`/upload-pdf/`, `/simplify-text/`, `/generate-quiz/`, `/chatbot/`) stay mounted
alongside `/api/*` throughout Phase 0 so the existing frontend keeps working. They are removed only
once every caller is migrated.

---

## Changelog

- **v1** — Phase 0. Initial freeze.
