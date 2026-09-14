/**
 * Profile-aware notifications — one call site, modality decided per viewer.
 *
 * Replaces alert() (blocking, invisible to no one but ALSO unstyleable and
 * un-announceable) and gives VoiceNavigator's audio-only state cues
 * (services/speech.ts playCue) a visual twin. Without this, every "listening…
 * / not understood" tone in VoiceNavigator is silently unusable for a deaf
 * student — the cue exists, but only as sound.
 *
 * Decoupled from React on purpose, same pattern as voice:command in
 * VoiceNavigator.tsx: any code, component or not, can call notify() without
 * needing a hook or being inside a provider. <NotificationCenter/> (mounted
 * once in App.tsx) is the only thing that listens and decides how to render it.
 */

export type NotifyKind = 'info' | 'success' | 'error' | 'listening' | 'thinking';

export interface NotifyOptions {
  kind?: NotifyKind;
  /** Also speak this via TTS for viewers who have it on. Defaults to the message. */
  speak?: string;
  /** Trigger a phone vibration (Vibration API) — meaningful for deaf/hard-of-hearing
   * viewers away from the screen, meaningless everywhere else so keep it rare. */
  vibrate?: boolean;
  /** ms before the visual toast auto-dismisses. */
  durationMs?: number;
  /** Skip AccessibleNotification's own speak() call — set by callers (e.g.
   * services/speech.ts announce()) that already spoke the message themselves,
   * so the toast doesn't get spoken twice. */
  silent?: boolean;
}

export interface NotifyEventDetail extends Required<Omit<NotifyOptions, 'speak'>> {
  id: number;
  message: string;
  speak: string;
}

let seq = 0;

const DEFAULT_DURATION: Record<NotifyKind, number> = {
  info: 3000,
  success: 2500,
  error: 4500,
  // Non-zero rather than "stays until explicitly cleared" — a recognition
  // that ends in silence (no speech detected) would otherwise leave
  // "Listening…" on screen indefinitely with no natural next event to replace it.
  listening: 6000,
  thinking: 5000,
};

// Short vibration patterns (ms on/off). Kept subtle — this fires on ordinary
// state changes, not just alarms, so it must not feel like a phone alert.
const VIBRATE_PATTERN: Partial<Record<NotifyKind, number[]>> = {
  error: [80, 60, 80],
  success: [40],
  listening: [30],
};

export function notify(message: string, opts: NotifyOptions = {}): void {
  const kind = opts.kind ?? 'info';
  const detail: NotifyEventDetail = {
    id: ++seq,
    message,
    kind,
    speak: opts.speak ?? message,
    vibrate: opts.vibrate ?? kind === 'error',
    durationMs: opts.durationMs ?? DEFAULT_DURATION[kind],
    silent: opts.silent ?? false,
  };

  window.dispatchEvent(new CustomEvent<NotifyEventDetail>('app:notify', { detail }));

  if (detail.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
    // Vibration API requires a prior user gesture on some browsers and simply
    // no-ops otherwise — never worth a try/catch, it fails silently by design.
    navigator.vibrate(VIBRATE_PATTERN[kind] ?? [50]);
  }
}
