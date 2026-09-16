# EduEase — AI Adaptive Learning Assistant

A disability-adaptive reading and assessment platform. A student uploads a
PDF; the system simplifies it to their grade level **and** disability
profile, generates an adapted quiz, answers questions via a RAG chatbot, and
tracks how they engaged with each question. That telemetry becomes a
**DASE score** — a disability-weighted composite, not a single accuracy
number — that teachers see on a roster scoped to their own students.

For how everything actually works — architecture, every backend
calculation and the formula/weights behind it, data shapes, API surface,
and more — see **[docs/](docs/)**, starting with
**[docs/PROJECT_EXPLANATION.md](docs/PROJECT_EXPLANATION.md)**.

---

## Documentation

| Doc | Covers |
|---|---|
| [PROJECT_EXPLANATION.md](docs/PROJECT_EXPLANATION.md) | Architecture, the full content pipeline, and every backend calculation (readability, sentiment, quiz validation, DASE scoring, error classification) with formulas and worked examples |
| [DATA_CONTRACT.md](docs/DATA_CONTRACT.md) | Firestore layout, telemetry event shapes, consent — the frozen data contract |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | Full endpoint reference (or import [postman_collection.json](postman_collection.json)) |
| [DISABILITY_RESEARCH.md](docs/DISABILITY_RESEARCH.md) | The research basis behind each disability's design choices |
| [ROADMAP.md](docs/ROADMAP.md) | Scope decisions, what was cut and why, current implementation status, known gaps |
| [PHASE_LEARNINGS.md](docs/PHASE_LEARNINGS.md) | Build history — what broke, what was fixed, why, phase by phase |
| [BRANCH_COMPARISON.md](docs/BRANCH_COMPARISON.md) | Why this codebase looks the way it does — the `master`/`main` merge decisions |
| [ETHICS_AND_PRIVACY.md](docs/ETHICS_AND_PRIVACY.md) | Ethics and privacy considerations (stub) |
| [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Demo walkthrough script (stub) |

## Prerequisites

- Python 3.10+, Node.js 18+
- A Firebase project with Authentication and Firestore enabled — **the
  frontend's `VITE_FIREBASE_*` config and the backend's
  `serviceAccountKey.json` must belong to the same project**, or auth and
  Firestore reads fail with permission errors that look unrelated.
- A Google AI API key (Gemini); a Groq API key is recommended too — Gemini's
  free tier is 20 requests/day and Groq is the automatic fallback.

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

Copy `.env.example` to `.env`:

```
GOOGLE_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

Place `serviceAccountKey.json` (Firebase Console → Project Settings →
Service Accounts) in `backend/`.

### Frontend

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env` and fill in the **same** Firebase project's
web app config from Firebase Console → Project Settings → General → Your apps.

## Running

```bash
cd backend && uvicorn app:app --reload --port 8000
cd frontend && npm run dev
```

The app is available at `http://localhost:5173`. On first startup the
backend seeds demo accounts:

| Role    | Email              | Password    |
|---------|--------------------|-------------|
| Admin   | admin@test.com     | admin@123   |
| Teacher | teacher1@test.com  | teacher@123 |
| Student | student1@test.com  | student@123 |

## License

MIT
