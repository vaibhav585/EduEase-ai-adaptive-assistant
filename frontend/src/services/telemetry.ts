/**
 * Telemetry client — buffers learning events and flushes them to the backend.
 * Event shapes are frozen in DATA_CONTRACT.md v1 (§3).
 *
 * Design rule: telemetry must NEVER break the lesson. Every failure path here is
 * swallowed and logged. A student losing their quiz because an analytics POST
 * 500'd is strictly worse than losing the analytics.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface QuestionEvent {
  type: 'question';
  sessionId: string;
  studentId: string;
  ts: number;
  questionId: string;
  conceptId: string | null;
  topic: string | null;
  difficulty: number;
  questionType: string;
  selected: string | null;
  correct: boolean;
  timeMs: number;
  timeToFirstInteractionMs: number | null;
  attempts: number;
  answerChanges: number;
  hintsUsed: number;
  revisits: number;
  reRead: boolean;
  focusRatio: number | null;
  focusSamples: number;
  isRepresentation: boolean;
  originalQuestionId: string | null;
}

export interface ReadingEvent {
  type: 'reading';
  sessionId: string;
  studentId: string;
  ts: number;
  contentId: string | null;
  wordsRead: number;
  wpmSetting: number;
  elapsedMs: number;
  replays: number;
  ttsUsed: boolean;
  pauseCount: number;
  focusRatio: number | null;
  focusSamples: number;
  simplifyProfile: string;
}

export type LearningEvent = QuestionEvent | ReadingEvent;

const FLUSH_SIZE = 10;
const FLUSH_MS = 5000;

let buffer: LearningEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function post(path: string, body: unknown, method = 'POST') {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

export async function startSession(
  studentId: string,
  kind: 'quiz' | 'reading',
  contentId: string | null = null,
): Promise<string | null> {
  try {
    const { sessionId } = await post('/api/sessions', { studentId, kind, contentId });
    return sessionId;
  } catch (err) {
    console.warn('[telemetry] startSession failed; running un-instrumented', err);
    return null;
  }
}

export function track(event: LearningEvent): void {
  if (!event.sessionId) return; // session never started — drop silently
  buffer.push(event);
  if (buffer.length >= FLUSH_SIZE) {
    void flush();
  } else if (!timer) {
    timer = setTimeout(() => void flush(), FLUSH_MS);
  }
}

export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!buffer.length) return;

  const batch = buffer;
  buffer = [];
  try {
    await post('/api/events', { events: batch });
  } catch (err) {
    console.warn('[telemetry] flush failed, re-queueing', err);
    // Put them back at the front so ordering survives a transient failure,
    // but cap the buffer so an offline session can't grow without bound.
    buffer = [...batch, ...buffer].slice(-100);
  }
}

export async function endSession(
  sessionId: string | null,
  summary: {
    totalQuestions: number;
    correct: number;
    totalTimeMs: number;
    completed: boolean;
    meanFocusRatio: number | null;
  },
): Promise<void> {
  await flush();
  if (!sessionId) return;
  try {
    await post(`/api/sessions/${sessionId}`, { summary }, 'PATCH');
  } catch (err) {
    console.warn('[telemetry] endSession failed', err);
  }
}

/**
 * Computes and persists this session's DASE score.
 *
 * The evaluate endpoint (backend/routers/evaluation.py) existed since Phase 2 but
 * nothing called it — sessions ended, telemetry was recorded, and no evaluation
 * document was ever written, so the teacher dashboard's roster/student endpoints
 * had nothing to read and silently showed "no data" for every student.
 *
 * Called AFTER endSession, since evaluate reads the session's events from
 * Firestore and a session ended mid-write would be scored on a partial summary.
 * Best-effort: a failed evaluation must not block the student from seeing their
 * quiz results.
 */
export async function triggerEvaluation(
  sessionId: string | null,
  studentId: string,
  profile: string,
): Promise<void> {
  if (!sessionId || !studentId) return;
  try {
    await post('/api/evaluate', { sessionId, studentId, profile, persist: true });
  } catch (err) {
    console.warn('[telemetry] evaluate failed', err);
  }
}

/** Best-effort flush when the tab closes — abandoned sessions feed TASK_COMP. */
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && buffer.length) {
      const batch = buffer;
      buffer = [];
      // fetch() is cancelled on unload; sendBeacon is the only reliable option here.
      navigator.sendBeacon?.(
        `${API_URL}/api/events`,
        new Blob([JSON.stringify({ events: batch })], { type: 'application/json' }),
      );
    }
  });
}

/**
 * Accumulates focus samples from <Eye>'s onFocusChange callback and reports the
 * fraction of time a face was visible.
 *
 * NOTE: this is FACE PRESENCE, not gaze-on-content. Eye.tsx only checks whether
 * WebGazer produced data recently. Never surface it to teachers as "attention".
 */
export class FocusMeter {
  private focused = true;
  private since = Date.now();
  private focusedMs = 0;
  private totalMs = 0;
  private samples = 0;

  set(focused: boolean): void {
    const now = Date.now();
    const delta = now - this.since;
    this.totalMs += delta;
    if (this.focused) this.focusedMs += delta;
    this.focused = focused;
    this.since = now;
    this.samples += 1;
  }

  /** Returns null when there is too little data to be meaningful (contract §3.1). */
  read(): { focusRatio: number | null; focusSamples: number } {
    const now = Date.now();
    const total = this.totalMs + (now - this.since);
    const focused = this.focusedMs + (this.focused ? now - this.since : 0);
    if (this.samples < 5 || total === 0) return { focusRatio: null, focusSamples: this.samples };
    return { focusRatio: +(focused / total).toFixed(3), focusSamples: this.samples };
  }

  reset(): void {
    this.since = Date.now();
    this.focusedMs = 0;
    this.totalMs = 0;
    this.samples = 0;
  }
}
