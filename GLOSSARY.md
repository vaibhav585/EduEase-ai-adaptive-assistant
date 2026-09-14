# EduEase — Numbers and Terms

Every number the system produces, in plain language. Read this before working on Track A, B or C.

There are **two separate number systems** and they never mix:

- **Phase 1 numbers measure TEXT** — is this passage readable?
- **Phase 2 numbers measure STUDENTS** — how is this learner doing?

---

# Part 1 — Text numbers (Phase 1)

### Grade level

The US school grade needed to read something. Grade 8 means a 13-year-old can read it.

Computed by the Flesch-Kincaid formula in `backend/services/readability.py` from exactly two inputs:
average sentence length, and average syllables per word. Longer sentences plus longer words equals a
higher grade.

Your biology passage measured **grade 15.5** — university reading level, for a school science topic.
That is the problem the simplifier exists to solve.

### Delta

The change. `gradeDelta = gradeBefore - gradeAfter`. Grade 15.5 down to 7.7 is a **delta of 7.8**.
Bigger delta means bigger simplification. It is a subtraction, nothing more.

### Average sentence length

Words divided by sentences. It matters because it is the one thing the prompt directly controls: the
deaf profile is instructed "maximum 10 words per sentence", so measuring 6.6 proves the model obeyed.

This is why profile targets are set on sentence length rather than on an absolute reading-ease score.
Technical vocabulary that must be preserved ("photosynthesis", "chlorophyll") makes an absolute target
unreachable — see PHASE_LEARNINGS.md §1.3 for the full story.

### Reading a Phase 1 row

```
deaf   15.5 -> 7.7   delta 7.8   sent 6.6   target 11.0   met True
```

> Source text was grade 15.5. After the deaf rewrite it is grade 7.7, a drop of 7.8 grades. Sentences
> average 6.6 words against a target of at most 11. Both checks passed.

---

# Part 2 — Student numbers (Phase 2 / DASE)

Four layers stacked on each other. They only make sense in order.

## Layer 1 — Parameters

Ten separate things measured about a student, **each scaled 0 to 1**. Ten small report cards, not one
grade.

| Parameter | Plain meaning |
|---|---|
| `ACC` | Accuracy. 7 of 10 correct is 0.70 |
| `ADJ_ACC` | Accuracy after forgiving attention-lapse mistakes |
| `COMP` | Accuracy on the harder questions only (difficulty 3+) |
| `TIME_EFF` | Speed compared to **their own** normal pace |
| `ATT_SPAN` | Fraction of time a face was visible to the webcam |
| `CONSIST` | Stability of performance — no wild swings |
| `EFFORT` | Engagement: answer changes, re-reads, real time spent |
| `LRN_VEL` | Learning velocity — did they improve during the session |
| `TASK_COMP` | Fraction of started sessions actually finished |
| `READ_FL` | Reading fluency — words per minute |

Five more are declared but not yet measurable: `VOICE_Q` and `NAV_EFF` (Phase 3), `VIS_ENG`
(Phase 5), `WRIT_EXP` and `FRUST` (unimplemented).

**A student is never one number. They are ten.** That is the point — traditional grading collapses all
ten into `ACC` and discards the rest.

## Layer 2 — Weights

**A weight decides how much a parameter counts toward the final score.** They are importance
multipliers, nothing more mysterious than that.

From `backend/data/dase_profiles.json`:

**`default`** — no disability declared. Accuracy dominates, like an ordinary grade:

```
ACC 0.30 | COMP 0.15 | EFFORT 0.15 | LRN_VEL 0.15 | TIME_EFF 0.10 | CONSIST 0.10 | TASK_COMP 0.05
```

**`adhd`** — raw accuracy drops to 0.15, adjusted accuracy becomes the largest term, effort is
rewarded heavily:

```
ACC 0.15 | ADJ_ACC 0.28 | EFFORT 0.22 | TASK_COMP 0.10 | LRN_VEL 0.10 | CONSIST 0.05
ATT_SPAN 0.15 -> diagnosticOnly (measured, NOT scored)
```

**`dyslexia`** — accuracy drops to 0.10 because decoding errors depress it; comprehension dominates
at 0.32:

```
ACC 0.10 | COMP 0.32 | EFFORT 0.18 | LRN_VEL 0.15 | TIME_EFF 0.10 | CONSIST 0.05
READ_FL 0.15 -> diagnosticOnly
```

**The novelty in one sentence:** the same ten measurements are multiplied by different importance
numbers depending on the student's disability. Raw accuracy is worth 0.30 to a student with no
declared disability and 0.10 to a dyslexic student — because for the dyslexic student a wrong answer
often means "misread the question", not "did not understand it".

There are 13 profiles. All are config, not code, so a teacher can override them per student.

## Layer 3 — Renormalization

Weights are authored to sum to about 1.0, but some parameters get dropped — no data source, or
diagnostic-only. The survivors are rescaled to sum back to 1.0.

ADHD declares 8 weights. `ATT_SPAN` is diagnostic-only and `FRUST` has no data. Six survive, summing
to 0.90, so each is divided by 0.90:

```
ADJ_ACC:  0.28 / 0.90 = 0.3111
```

Without this, dropping a parameter would silently shrink the score. **A missing parameter must never
look like a zero score.**

## Layer 4 — The score

Multiply, add, divide. A real worked example — the `distracted_capable` archetype under `adhd`:

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

The same student under `default` scores **0.578**. Same data, different lens — and the ADHD lens
correctly rates them higher, because it credits knowledge that their attention lapses were hiding.

---

# Part 3 — Supporting numbers

### `coverage`

What fraction of a profile's intended weight was actually measurable. The example above is **0.947**:
94.7% covered, only `FRUST` missing.

**This is the score's own honesty rating.** A DASE score at 40% coverage is a far weaker claim than
one at 95%, and the teacher dashboard must show it.

### `confidence` (error classifier only)

How sure the classifier is about *why* an answer was wrong. 0.9 is strong evidence; 0.3 is close to a
shrug.

It matters because `ADJ_ACC` multiplies by it:

```
credit = attentionLapseCredit x confidence     (attentionLapseCredit = 0.75)
```

At confidence 0.9 a student recovers 0.675 of a mark; at confidence 0.1, only 0.075. **A shaky
classifier therefore cannot move the score much** — deliberate, see IMPLEMENTATION_ROADMAP.md §2.3.

### `representThreshold` = 0.45

The closed loop only re-presents a simpler question when classifier confidence reaches 0.45. Below
that we are not sure enough to interrupt the student.

### `diagnosticOnly`

Parameters that are **measured and reported but excluded from the score**.

The rule: *a parameter must not be scored in a profile if a more severe form of that same disability
would mechanically lower it, independent of how much the student learned.*

`ATT_SPAN` under ADHD is the clearest case — attention span *is* the condition, so scoring it
penalises the student for having ADHD. It still appears on the radar chart, because it is useful
context for a teacher. It just does not count toward the score. This flaw was caught by
`run_ablation.py`; see PHASE_LEARNINGS.md §2.4.

### `degraded`

The LLM was unavailable and a fallback was used. Content still works, but **results from a degraded
session must be excluded from any analysis**, because the questions came from the weak spaCy
generator rather than Gemini.

---

# Part 4 — Ablation table terms

`backend/scripts/run_ablation.py` scores 5 synthetic archetype students under all 13 profiles.

### Spread

`max - min` **down a column** — the five students under one profile.

Answers: *does this profile tell students apart at all?* A profile with spread near zero rates
everybody the same and is useless.

### Delta

`max - min` **across a row** — one student under all 13 profiles.

Answers: *how much does the choice of profile change this student's outcome?*

| Student | Range | Delta |
|---|---|---|
| strong_all_round (control) | 0.837 - 0.879 | **0.044** |
| persistent_struggler | 0.608 - 0.842 | **0.234** |

An obviously strong student scores about 0.86 under every profile — the lens barely matters. A
struggling student swings **23 points** depending on the lens.

That is the correct property: where performance is unambiguous the profile should not matter, and
where it is ambiguous the profile *is* the whole question. It is also an argument for teacher
override, and a limitation to state plainly in the paper.

### "7 distinct rankings"

Sort the 5 students best-to-worst under each of the 13 profiles. If disability weighting did nothing,
all 13 orderings would be identical and this number would be **1**.

It is **7**. That is the evidence the weighting changes outcomes. `run_ablation.py` exits non-zero if
it ever drops to 1 — the novelty claim failing is a build failure, not a footnote.

---

# Part 5 — Error classifier labels

Every wrong answer is classified by probable cause:

| Label | Meaning | Signals |
|---|---|---|
| `KNOWLEDGE_GAP` | Engaged properly, still wrong. The honest residual | Normal time, normal focus |
| `ATTENTION_LAPSE` | Knew it, lost focus | Much faster than their baseline + looking away |
| `PROCESSING_DELAY` | Could have solved it, ran out of time | Much slower than their baseline, or timed out |
| `COMPREHENSION_BARRIER` | The question's wording did not land | Very fast, present and looking, never re-read the stem |

Only `COMPREHENSION_BARRIER` triggers the closed loop, and only above the confidence threshold.
Re-presenting a `KNOWLEDGE_GAP` would just show the student a question they still cannot answer, in
easier words.

**Baselines are always the student's own rolling median**, never a cohort average. The same 3-second
answer is normal for a fast student and a red flag for a slow one.

**When the signals cannot separate two labels**, the classifier returns `KNOWLEDGE_GAP` at low
confidence and records the alternatives, rather than guessing. Guessing would manufacture a
confident-looking finding out of nothing.

---

# The caveat to keep repeating

The weights (0.30, 0.15, 0.28 ...) are **literature-informed, not empirically validated**.

The ablation proves the weighting **differentiates** students. It does **not** prove the weights are
**correct**. Validating them requires real learners.

This is stated in the config header, in the ablation script's own output, and it belongs in the
paper's limitations section.
