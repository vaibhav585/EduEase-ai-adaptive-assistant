# AI Adaptive Learning Assistant for Neurodivergent Students

A secure, AI-powered assistive reading workspace designed for neurodivergent children (ADHD, Autism, Dyslexia, Auditory Processing Disorders). Educators monitor student progress in real time through a live telemetry dashboard backed by Firebase and Recharts.

## Architecture Overview

```
Frontend (React + Vite + Tailwind)        Backend (FastAPI + Python 3.13)
+---------------------------------+       +------------------------------------+
|  Firebase Auth (login/reg)      |       |  verify_user  (token validation)   |
|  UploadForm  --POST /upload-pdf/------->|  verify_role  (RBAC middleware)    |
|  LearningPage -POST /simplify-text/---->|  Gemini 2.5 Flash LLM             |
|  Chatbot     --POST /chatbot/---------->|  FAISS + ParentDocumentRetriever   |
|  Eye.tsx     <-- sentiment prop --------|  CrossEncoder reranker             |
|  QuizPage    --POST /generate-quiz/---->|  spaCy NLP quiz generation         |
|  TeacherDash --GET /teacher/*---------->|  Firestore aggregation queries     |
+---------------------------------+       +------------------------------------+
                                                        |
                                          +-------------+----------------+
                                          |  Google Cloud Firestore      |
                                          |  +-- users/{uid}             |
                                          |  +-- content/{id}            |
                                          |  +-- quiz_results/{id}       |
                                          |  +-- telemetry_sessions/{id} |
                                          +------------------------------+
```

## Core Features

### 1. Adaptive AI Text Simplification

Powered by Gemini 2.5 Flash with a persona-driven prompt system. The LLM adopts the role of a special education teacher and applies grade-specific linguistic constraints:

| Grade | Max Words/Sentence | Profile |
|-------|-------------------|---------|
| 1-2   | 8                 | Age 6-8, one-syllable vocabulary preferred |
| 3-4   | 10                | Age 8-10, concrete everyday vocabulary |
| 5-6   | 12                | Age 10-12, common two-syllable words allowed |
| 7-8   | 15                | Age 12-14, grade-appropriate academic terms |

Each level supports three difficulty tiers: **Easy**, **Medium**, **Hard**. No metaphors, idioms, passive voice, or multi-idea sentences are permitted. Falls back to spaCy lemmatization if the LLM call fails.

### 2. RAG Chatbot with Sentiment Analysis

- **Ingestion**: Uploaded PDFs and manual text are split into parent chunks (~800 tokens) and child chunks (~150 tokens) using LangChain's `ParentDocumentRetriever`.
- **Embedding**: Google `text-embedding-004` encodes child chunks into a FAISS vector index persisted to disk.
- **Retrieval**: Queries fetch 12 candidates, filter by student `grade_level`/`reading_difficulty` metadata, then rerank with `BAAI/bge-reranker-base` cross-encoder down to the top 4.
- **Generation**: The top parent chunks are injected as context into a per-session `ConversationChain` with `ConversationBufferMemory` (TTL: 1 hour, max 256 sessions).
- **Sentiment**: A secondary Gemini call scores every exchange with `frustration_score` (0.0-1.0) and `suggested_action` ("continue" | "simplify" | "offer_break").

### 3. Eye-Tracking Focus Detection & Cognitive Overlays

WebGazer.js tracks gaze position via the webcam. If no gaze data arrives for 1.5 seconds, the system marks the student as distracted and pauses the paced reader.

When chatbot sentiment returns `frustration_score > 0.7` or `suggested_action == "offer_break"`, the Eye component triggers an animated alert banner with a "Read Aloud" TTS button. All animations use `motion-safe:` Tailwind prefixes to respect `prefers-reduced-motion`.

### 4. Quiz Generation & Telemetry

spaCy NLP extracts nouns, verbs, and adjectives from simplified text to generate fill-in-the-blank questions with 4 options each (capped at 10 questions). On completion, the frontend logs results to `POST /analytics/log-quiz/` including the `wrong_topics` array (the answer keywords the student missed).

### 5. Live Teacher Dashboard

Teachers see a dynamic Recharts-powered dashboard pulling from Firestore:
- **Student Roster**: Fetched from `/teacher/students` (RBAC-protected, teacher-only).
- **Quiz Accuracy LineChart**: Score percentages over time per student.
- **Focus & Frustration Timeline**: Dual-axis LineChart (focus % vs frustration trigger count).
- **Weak Topics BarChart**: Horizontal bar ranking most-missed keywords.

## Security Architecture

| Layer | Mechanism |
|-------|-----------|
| Authentication | Firebase Admin SDK `verify_id_token` on every protected route |
| Authorization | `verify_role("teacher")` checks Firestore `/users/{uid}.role` |
| Content isolation | `/get-content/` filters by `uid`; students only see their own uploads |
| Input guardrails | Regex scanner blocks prompt injection patterns and masks PII (email, phone, zip) |
| Output guardrails | Regex scanner blocks toxic phrases; fails safe to a static fallback message |
| PDF validation | 5 MB size limit, 20-page cap, PyPDF2 parse validation |

## Application Data Flow

```
Student uploads PDF
       |
       v
POST /upload-pdf/ -- PyPDF2 extraction -- FAISS parent-child ingestion
       |
       v
POST /simplify-text/ -- Gemini profile-matched rewrite -- Paced reader UI
       |                                                        |
       v                                                        v
POST /chatbot/ -- RAG retrieval -- Gemini response ---- Eye.tsx sentiment banner
       |                                                        |
       v                                                        v
POST /generate-quiz/ -- spaCy NLP -- Interactive quiz -- POST /analytics/log-quiz/
                                                                |
                                                                v
                                                POST /analytics/log-session/
                                                                |
                                                                v
                                          GET /teacher/students -- GET /teacher/analytics/{id}
                                                                |
                                                                v
                                                   Recharts dashboard (LineChart + BarChart)
```

## Quick Start

### Prerequisites

- Python 3.13+
- Node.js 18+
- Firebase project with Firestore enabled
- Google Cloud API key with Gemini access
- `serviceAccountKey.json` in `backend/`

### Backend

```bash
cd backend
cp .env.example .env          # Set GOOGLE_API_KEY
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn app:app --reload --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env          # Set VITE_API_URL and VITE_FIREBASE_* keys
npm install
npm run dev                   # http://localhost:5173
```

### Environment Variables

**Backend** (`backend/.env`):
```
GOOGLE_API_KEY=your_google_api_key
```

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Project Structure

```
ai-assistant-neurodivergent/
+-- backend/
|   +-- app.py                 # FastAPI application (all routes + middleware)
|   +-- config.py              # Environment variable loading
|   +-- firebase_config.py     # Firebase Admin SDK initialization
|   +-- ingestion.py           # FAISS vector store + ParentDocumentRetriever
|   +-- models/
|   |   +-- schemas.py         # Pydantic request/response models
|   +-- data/
|   |   +-- faiss_index/       # Persisted FAISS vector index
|   +-- .env.example
|   +-- requirements.txt
+-- frontend/
|   +-- src/
|   |   +-- components/
|   |   |   +-- AuthForm.tsx       # Login/register with role selection
|   |   |   +-- Chatbot.tsx        # AI chatbot with sentiment callback
|   |   |   +-- Charts.tsx         # Recharts (LineChart + BarChart)
|   |   |   +-- ContentForm.tsx    # Text/PDF content management
|   |   |   +-- ControlsBar.tsx    # Reader controls
|   |   |   +-- Eye.tsx            # WebGazer eye tracking + sentiment banners
|   |   |   +-- Layout.tsx         # Navigation shell
|   |   |   +-- RoleGate.tsx       # Client-side RBAC guard
|   |   |   +-- UploadForm.tsx     # PDF upload with profile forwarding
|   |   +-- pages/
|   |   |   +-- LearningPage.tsx       # Paced reader + chatbot + eye tracker
|   |   |   +-- QuizPage.tsx           # Interactive quiz with telemetry logging
|   |   |   +-- TeacherDashboardPage.tsx # Live analytics dashboard
|   |   |   +-- DashboardPage.tsx      # Student navigation hub
|   |   +-- services/
|   |   |   +-- api.ts            # Axios client with auth interceptor
|   |   |   +-- firebase.ts       # Firebase SDK initialization
|   |   +-- App.tsx               # React Router with RoleGate guards
|   +-- .env.example
|   +-- package.json
+-- README.md
+-- API_DOCUMENTATION.md
+-- postman_collection.json
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | FastAPI, Python 3.13, Pydantic v2 |
| AI/ML | Gemini 2.5 Flash, LangChain, FAISS, sentence-transformers, spaCy |
| Auth | Firebase Authentication + Firebase Admin SDK |
| Database | Google Cloud Firestore |
| Eye Tracking | WebGazer.js |
| Accessibility | `motion-safe:` animations, `aria-live` regions, `aria-current` tracking, Web Speech API TTS |

## Firestore Collections

| Collection | Fields | Written By |
|------------|--------|-----------|
| `users/{uid}` | `email`, `role`, `grade_level`, `reading_difficulty` | Frontend (registration) |
| `content/{id}` | `text`, `uid` | `POST /add-content/` |
| `quiz_results/{id}` | `student_id`, `score`, `total_questions`, `wrong_topics`, `timestamp` | `POST /analytics/log-quiz/` |
| `telemetry_sessions/{id}` | `student_id`, `session_id`, `average_focus_score`, `frustration_triggers`, `timestamp` | `POST /analytics/log-session/` |

## License

MIT
