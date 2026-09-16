/**
 * Telemetry client — buffers learning events and flushes them to the backend.
 * Event shapes are frozen in DATA_CONTRACT.md v1 (§3).
 *
 * Design rule: telemetry must NEVER break the lesson. Every failure path here is
 * swallowed and logged. A student losing their quiz because an analytics POST
 * 500'd is strictly worse than losing the analytics.
 *
 * Uses the shared `api` axios client (not raw fetch, unlike master's original)
 * so every call carries the Firebase ID token the merged backend's
 * Depends(verify_user) now requires on every /api/* route.
 */

import api from './api';

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

export async function startSession(
  studentId: string,
  kind: 'quiz' | 'reading',
  contentId: string | null = null,
): Promise<string | null> {
  try {
    const { data } = await api.post('/api/sessions', { studentId, kind, contentId });
    return data.sessionId;
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
    await api.post('/api/events', { events: batch });
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
    await api.patch(`/api/sessions/${sessionId}`, { summary });
  } catch (err) {
    console.warn('[telemetry] endSession failed', err);
  }
}

/**
 * Computes and persists this session's DASE score.
 *
 * The evaluate endpoint (backend/routers/evaluation.py) exists but nothing
 * calls it unless a page does so explicitly — sessions can end, telemetry
 * gets recorded, and no evaluation document is ever written, leaving the
 * teacher dashboard's roster/student endpoints with nothing to read.
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
    await api.post('/api/evaluate', { sessionId, studentId, profile, persist: true });
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
      // sendBeacon can't carry an Authorization header, so this best-effort flush
      // will only succeed if the backend ever allows it unauthenticated — until
      // then it's a safe no-op rather than a thrown error.
      const apiUrl = (api.defaults.baseURL as string) ?? '';
      navigator.sendBeacon?.(
        `${apiUrl}/api/events`,
        new Blob([JSON.stringify({ events: batch })], { type: 'application/json' }),
      );
    }
  });
}

/**
 * Accumulates focus samples from <Eye>'s onFocusChange callback and reports the
 * fraction of time a face was visible.
 *
 * NOTE: this is FACE PRESENCE (or MediaPipe gaze-on-screen in this merged
 * codebase's Eye.tsx), not a guarantee of attention. Never surface it to
 * teachers as more than a supportive signal.
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
