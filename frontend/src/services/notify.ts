/**
 * Profile-aware notifications — one call site, modality decided per viewer.
 * <AccessibleNotification/> (mounted once in App.tsx) listens and renders.
 */

export type NotifyKind = 'info' | 'success' | 'error' | 'listening' | 'thinking';

export interface NotifyOptions {
  kind?: NotifyKind;
  /** Also speak this via TTS for viewers who have it on. Defaults to the message. */
  speak?: string;
  /** Trigger a phone vibration — meaningful for deaf/hard-of-hearing viewers away
   * from the screen, meaningless everywhere else so keep it rare. */
  vibrate?: boolean;
  durationMs?: number;
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
  listening: 6000,
  thinking: 5000,
};

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
    navigator.vibrate(VIBRATE_PATTERN[kind] ?? [50]);
  }
}
