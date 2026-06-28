# API Documentation

Base URL: `http://localhost:8000`

All protected routes require an `Authorization: Bearer <firebase_id_token>` header.

---

## Authentication & Authorization

### Token Authentication (`verify_user`)

Extracts the Bearer token from the `Authorization` header and validates it via `firebase_admin.auth.verify_id_token()`. Returns the decoded token dictionary containing `uid`, `email`, etc.

**Failure responses:**
- `401 Unauthorized` — Missing, malformed, or expired token.

### Role Authorization (`verify_role`)

Extends `verify_user`. After token validation, queries Firestore at `/users/{uid}` and asserts the `role` field matches the required role.

**Failure responses:**
- `401 Unauthorized` — Invalid token.
- `403 Forbidden` — User profile not found or role mismatch.

---

## Public Routes

### `GET /`

Health check endpoint.

| Field | Value |
|-------|-------|
| Auth | None |
| Role | None |

**Response `200`:**
```json
{
  "message": "Welcome to the AI-Powered Easy-Learning Application"
}
```

---

## Student Routes

### `POST /upload-pdf/`

Upload a PDF file for text extraction and FAISS vector ingestion.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |
| Content-Type | `multipart/form-data` |

**Request body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | File (PDF) | Yes | PDF file to parse |

**Validation:**
- Max file size: 5 MB
- Max pages: 20
- Must be valid PDF

**Response `200`:**
```json
{
  "text": "Extracted plain text from all pages...",
  "chunks_ingested": 4
}
```

**Error responses:**
- `400` — File exceeds size limit, invalid PDF, or exceeds page limit.
- `401` — Missing or invalid token.

---

### `POST /simplify-text/`

Simplify text using Gemini LLM with grade-level and difficulty adaptation.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |
| Content-Type | `application/json` |

**Request body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Raw text to simplify |
| `grade_level` | string | No | Grade level ("1"-"8"). Default: "4" |
| `reading_difficulty` | string | No | "easy", "medium", or "hard". Default: "medium" |

**Response `200`:**
```json
{
  "simplified_text": "Plants use sunlight to make food. This is called photosynthesis."
}
```

**Error responses:**
- `400` — Empty text body.
- `401` — Missing or invalid token.

---

### `POST /add-content/`

Add text content to Firestore and ingest into the FAISS vector store.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |
| Content-Type | `application/x-www-form-urlencoded` |

**Request body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string (form field) | Yes | Text content to store |

**Response `200`:**
```json
{
  "id": "firestore_document_id",
  "chunks_ingested": 2
}
```

---

### `GET /get-content/`

Retrieve all content documents owned by the authenticated user.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |

**Response `200`:**
```json
{
  "content": [
    { "id": "doc_id_1", "text": "Content text..." },
    { "id": "doc_id_2", "text": "More content..." }
  ]
}
```

Content is filtered by the authenticated user's `uid`. Users only see their own uploads.

---

### `POST /generate-quiz/`

Generate fill-in-the-blank quiz questions from text using spaCy NLP.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |
| Content-Type | `application/json` |

**Request body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Source text for quiz generation |

**Response `200`:**
```json
{
  "questions": [
    {
      "question": "Plants use ______ to make food.",
      "options": ["sunlight", "water", "rocks", "air"],
      "answer": "sunlight"
    }
  ]
}
```

---

### `POST /chatbot/`

Send a message to the RAG-powered chatbot with sentiment analysis.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |
| Content-Type | `application/json` |
| Response Model | `ChatbotResponse` |

**Request body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | User message |
| `session_id` | string | Yes | Unique session identifier (e.g., `{uid}_{timestamp}`) |
| `grade_level` | string | No | Grade level for retrieval filtering |
| `reading_difficulty` | string | No | Difficulty for retrieval filtering |

**Response `200`:**
```json
{
  "response": "Photosynthesis is how plants make food using sunlight.",
  "sentiment": {
    "frustration_score": 0.3,
    "suggested_action": "continue"
  }
}
```

**Sentiment `suggested_action` values:**
- `"continue"` — Student is engaged, no intervention needed.
- `"simplify"` — Mild frustration detected, consider simplifying content.
- `"offer_break"` — High frustration (>0.7), trigger a break prompt.

**Safety behavior:**
- Prompt injection patterns are blocked; the response returns a safe fallback message.
- PII (emails, phone numbers, zip codes) is masked in both input and output.
- Toxic LLM output is intercepted and replaced with the fallback message.

---

## Analytics Routes

### `POST /analytics/log-quiz/`

Log quiz results to Firestore for teacher dashboard aggregation.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |
| Content-Type | `application/json` |

**Request body:**

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `score` | integer | Yes | >= 0 | Number of correct answers |
| `total_questions` | integer | Yes | >= 1 | Total questions in quiz |
| `wrong_topics` | string[] | No | — | Answer keywords the student missed |

**Response `200`:**
```json
{ "status": "logged" }
```

**Firestore document written to `quiz_results/{auto_id}`:**
```json
{
  "student_id": "firebase_uid",
  "score": 7,
  "total_questions": 10,
  "wrong_topics": ["photosynthesis", "mitosis"],
  "timestamp": "2025-06-28T12:00:00+00:00"
}
```

---

### `POST /analytics/log-session/`

Log a learning session's focus and frustration metrics.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | Any authenticated user |
| Content-Type | `application/json` |

**Request body:**

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `session_id` | string | Yes | — | Session identifier |
| `average_focus_score` | float | Yes | 0.0 - 1.0 | Mean focus score for the session |
| `frustration_triggers` | integer | Yes | >= 0 | Number of frustration events |

**Response `200`:**
```json
{ "status": "logged" }
```

**Firestore document written to `telemetry_sessions/{auto_id}`:**
```json
{
  "student_id": "firebase_uid",
  "session_id": "sess-abc-123",
  "average_focus_score": 0.78,
  "frustration_triggers": 3,
  "timestamp": "2025-06-28T12:00:00+00:00"
}
```

---

## Teacher Routes

### `GET /teacher/students`

Retrieve the roster of all students registered in the system.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | `verify_role("teacher")` |

**Response `200`:**
```json
{
  "students": [
    {
      "uid": "student_firebase_uid",
      "email": "student@example.com",
      "grade_level": "3",
      "reading_difficulty": "easy"
    }
  ]
}
```

**Error responses:**
- `401` — Invalid token.
- `403` — User is not a teacher.

---

### `GET /teacher/analytics/{student_id}`

Retrieve aggregated quiz and session analytics for a specific student.

| Field | Value |
|-------|-------|
| Auth | `verify_user` |
| Role | `verify_role("teacher")` |

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `student_id` | string | Firebase UID of the target student |

**Response `200`:**
```json
{
  "student_id": "stu-001",
  "quizzes": [
    {
      "score": 7,
      "total_questions": 10,
      "wrong_topics": ["photosynthesis", "mitosis"],
      "timestamp": "2025-06-28T12:00:00+00:00"
    }
  ],
  "sessions": [
    {
      "session_id": "sess-abc-123",
      "average_focus_score": 0.85,
      "frustration_triggers": 2,
      "timestamp": "2025-06-28T12:00:00+00:00"
    }
  ],
  "weak_topics": {
    "photosynthesis": 3,
    "mitosis": 1
  },
  "total_frustration_triggers": 5
}
```

**Error responses:**
- `401` — Invalid token.
- `403` — User is not a teacher.

---

## Route Summary Matrix

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/` | None | None | Health check |
| POST | `/upload-pdf/` | `verify_user` | Any | PDF upload + FAISS ingestion |
| POST | `/simplify-text/` | `verify_user` | Any | Gemini text simplification |
| POST | `/add-content/` | `verify_user` | Any | Store text + ingest vectors |
| GET | `/get-content/` | `verify_user` | Any | List user's own content |
| POST | `/generate-quiz/` | `verify_user` | Any | spaCy quiz generation |
| POST | `/chatbot/` | `verify_user` | Any | RAG chatbot + sentiment |
| POST | `/analytics/log-quiz/` | `verify_user` | Any | Log quiz results |
| POST | `/analytics/log-session/` | `verify_user` | Any | Log session telemetry |
| GET | `/teacher/students` | `verify_user` | Teacher | Student roster |
| GET | `/teacher/analytics/{student_id}` | `verify_user` | Teacher | Student analytics |
