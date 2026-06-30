# EduEase — AI Adaptive Learning Assistant

An assistive reading workspace built for students with neurodivergent learning needs (ADHD, Dyslexia, Autism, Auditory Processing Disorders). Students upload documents and receive grade-appropriate simplified text, an AI chatbot grounded in the uploaded content, and auto-generated quizzes. A face-based gaze tracker monitors attention and delivers non-intrusive prompts when focus drifts. Teachers and admins access live analytics through role-gated dashboards.

---

## Architecture

```
Frontend (React + Vite + TypeScript)       Backend (FastAPI + Python)
+-----------------------------------+      +------------------------------------+
|  Firebase Auth                    |      |  verify_user  — token validation   |
|  UploadForm  → POST /upload-pdf/  |----->|  verify_role  — RBAC middleware    |
|  LearningPage → POST /simplify-text/---->|  Gemini 2.0 Flash (LLM)          |
|  Chatbot     → POST /chatbot/     |----->|  FAISS + ParentDocumentRetriever  |
|  Eye.tsx     ← sentiment prop     |<-----|  CrossEncoder reranker             |
|  QuizPage    → POST /generate-quiz/----->|  spaCy NLP (quiz fallback)        |
|  TeacherDash → GET /teacher/*     |----->|  Firestore aggregation queries    |
+-----------------------------------+      +------------------------------------+
                                                         |
                                           +-------------+--------------+
                                           |  Google Cloud Firestore    |
                                           |  users / content /         |
                                           |  quiz_results / telemetry  |
                                           +----------------------------+
```

---

## Features

### Adaptive Text Simplification

Gemini 2.0 Flash rewrites uploaded text using a grade-specific prompt profile. The model acts as a special education teacher and applies hard constraints on sentence length, vocabulary complexity, and sentence structure (no passive voice, no idioms, no multi-clause sentences).

| Grade | Max words per sentence | Target age |
|-------|----------------------|------------|
| 1–2   | 8                    | 6–8        |
| 3–4   | 10                   | 8–10       |
| 5–6   | 12                   | 10–12      |
| 7–8   | 15                   | 12–14      |

Each grade level supports three difficulty tiers. If the LLM call fails, the system falls back to spaCy lemmatization.

### RAG Chatbot

PDFs are split into parent chunks (~3200 characters) and child chunks (~600 characters) using LangChain's `ParentDocumentRetriever`. Child chunks are embedded with `text-embedding-004` and stored in a FAISS index persisted to disk. At query time, 12 candidates are retrieved, filtered by the student's `grade_level` and `reading_difficulty` metadata, then reranked to the top 4 using a `BAAI/bge-reranker-base` cross-encoder. The top parent chunks provide context to a per-session `ConversationChain` with a 1-hour TTL (max 256 concurrent sessions).

A secondary Gemini call scores every chatbot exchange with a `frustration_score` (0.0–1.0) and a `suggested_action` (`continue`, `simplify`, or `offer_break`). This score is forwarded to the focus tracker to trigger contextual banners.

### Gaze-Based Focus Tracking

The focus tracker runs MediaPipe FaceLandmarker at ~15 fps against the webcam feed. It measures head orientation by computing how far the nose tip deviates from the eye midpoint horizontally (yaw) and vertically (pitch). If the head is turned or tilted beyond a threshold in any direction for more than four seconds, the session is marked as distracted and a banner is shown. Sustained eye closure (both eyes closed for more than 500 ms) is treated the same way; normal blinks are ignored.

Focus is restored automatically within about one second of the user looking back at the camera. No calibration is needed and there is no regression model that can drift — the signal is derived entirely from face geometry.

### Quiz Generation

Gemini generates three question types from the simplified text: multiple choice, true/false, and fill-in-the-blank. spaCy provides a fallback if the LLM call fails. On completion, the frontend posts results to `/analytics/log-quiz/` including the `wrong_topics` array for per-topic accuracy tracking.

### Teacher and Admin Dashboards

Teachers see a Recharts dashboard with quiz accuracy over time, a dual-axis focus and frustration timeline, and a weak-topics bar chart. The data is pulled from Firestore through RBAC-protected endpoints that scope each teacher's view to their own students.

Admins can view all users and create new teacher or student accounts.

---

## Security

| Layer | Mechanism |
|-------|-----------|
| Authentication | Firebase ID tokens verified on every protected route via Google's public signing keys |
| Authorization | `verify_role` checks Firestore `users/{uid}.role` before granting access |
| Content isolation | `/get-content/` and analytics endpoints filter by `uid` |
| Input guardrails | Regex scanner blocks prompt injection patterns and masks PII (email, phone, zip) |
| Output guardrails | Regex scanner blocks toxic phrases; falls back to a safe static response |
| PDF validation | 5 MB size limit, 20-page cap, PyPDF2 parse validation |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, Python 3.10+, Pydantic |
| LLM | Gemini 2.0 Flash (text-embedding-004 for embeddings) |
| Retrieval | LangChain, FAISS, sentence-transformers (BAAI/bge-reranker-base) |
| NLP | spaCy (en_core_web_sm) |
| Gaze tracking | MediaPipe Tasks Vision (FaceLandmarker) |
| Auth | Firebase Authentication + Firebase Admin SDK |
| Database | Google Cloud Firestore |
| Analytics | Recharts |
| Accessibility | ARIA live regions, Web Speech API (TTS + STT), motion-safe animations |

---

## Prerequisites

- Python 3.10 or later
- Node.js 18 or later
- A Firebase project with Authentication and Firestore enabled
- A Google AI API key with access to Gemini 2.0 Flash
- A Firebase service account key file (`serviceAccountKey.json`)

---

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

Copy `.env.example` to `.env` and fill in your API key:

```
GOOGLE_API_KEY=your_gemini_api_key
```

Place `serviceAccountKey.json` (downloaded from Firebase Console → Project Settings → Service Accounts) in the `backend/` directory.

### Frontend

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env` and fill in your Firebase project credentials:

```
VITE_API_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

---

## Running

Start the backend:

```bash
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000
```

Start the frontend in a separate terminal:

```bash
cd frontend
npm run dev
```

The app is available at `http://localhost:5173`.

On first startup the backend seeds demo accounts into Firebase Authentication and Firestore:

| Role    | Email              | Password    |
|---------|--------------------|-------------|
| Admin   | admin@test.com     | admin@123   |
| Teacher | teacher1@test.com  | teacher@123 |
| Student | student1@test.com  | student@123 |

---

## Project Structure

```
.
├── backend/
│   ├── app.py                  # All FastAPI routes and middleware
│   ├── firebase_config.py      # Firebase Admin SDK init, token verification
│   ├── ingestion.py            # FAISS ingestion and ParentDocumentRetriever
│   ├── config.py               # Environment variable loading
│   ├── models/schemas.py       # Pydantic request and response models
│   ├── data/faiss_index/       # Persisted FAISS vector index
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Eye.tsx          # MediaPipe gaze tracker
    │   │   ├── Chatbot.tsx      # AI chatbot with sentiment callback
    │   │   ├── Charts.tsx       # Recharts dashboard charts
    │   │   ├── UploadForm.tsx   # PDF upload
    │   │   ├── RoleGate.tsx     # Client-side RBAC guard
    │   │   └── Layout.tsx       # Navigation shell
    │   ├── pages/
    │   │   ├── LearningPage.tsx         # Reader, chatbot, and gaze tracker
    │   │   ├── QuizPage.tsx             # Interactive quiz with telemetry
    │   │   ├── TeacherDashboardPage.tsx # Live analytics
    │   │   └── AdminDashboardPage.tsx   # User management
    │   └── services/
    │       ├── api.ts           # Axios client with Firebase auth interceptor
    │       └── firebase.ts      # Firebase SDK initialisation
    ├── index.html
    ├── package.json
    └── .env.example
```

---

## Firestore Collections

| Collection | Key fields |
|------------|-----------|
| `users/{uid}` | `email`, `role`, `grade_level`, `reading_difficulty` |
| `content/{id}` | `text`, `uid` |
| `quiz_results/{id}` | `student_id`, `score`, `total_questions`, `wrong_topics`, `timestamp` |
| `telemetry_sessions/{id}` | `student_id`, `session_id`, `average_focus_score`, `frustration_triggers`, `timestamp` |

---

## API Reference

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for the full endpoint reference, or import [postman_collection.json](./postman_collection.json) directly into Postman.

---

## License

MIT
