/**
 * Speech in/out and audio cues for the voice layer.
 *
 * Uses only native browser APIs — Web Speech (SpeechSynthesis + SpeechRecognition)
 * and Web Audio for tones. No dependency, nothing to load, works offline for TTS.
 *
 * Non-negotiable rule throughout: a blind student must ALWAYS be able to interrupt.
 * Every speak() is cancellable and `stopAll()` is wired to Escape globally.
 */

import { notify } from './notify';

// SpeechRecognition is still vendor-prefixed in Chrome and absent in Firefox.
type SpeechRecognitionCtor = new () => any;

const Recognition: SpeechRecognitionCtor | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export const sttSupported = Boolean(Recognition);
export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

// ─────────────────────────── audio cues ───────────────────────────

/**
 * Short tones marking state changes. A blind user needs to know the mic opened
 * without waiting for a spoken confirmation that would itself take a second.
 * Rising = started, falling = stopped, low buzz = not understood.
 */
export type Cue = 'listening' | 'thinking' | 'speaking' | 'success' | 'error';

const CUE_TONES: Record<Cue, { freq: number[]; duration: number }> = {
  listening: { freq: [660, 880], duration: 0.09 }, // rising: mic open
  thinking: { freq: [520], duration: 0.06 },
  speaking: { freq: [440], duration: 0.05 },
  success: { freq: [880, 1100], duration: 0.08 },
  error: { freq: [300, 220], duration: 0.16 }, // falling: not understood
};

let audioCtx: AudioContext | null = null;

export function playCue(cue: Cue): void {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext ?? (window as any).webkitAudioContext)();
    // Browsers suspend the context until a user gesture; resume is a no-op otherwise.
    if (audioCtx.state === 'suspended') void audioCtx.resume();

    const { freq, duration } = CUE_TONES[cue];
    freq.forEach((f, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.frequency.value = f;
      osc.type = 'sine';
      // Short fade prevents the click you get from cutting a waveform at non-zero.
      const start = audioCtx!.currentTime + i * duration;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + duration);
    });
  } catch {
    // Audio cues are an enhancement. Never let them break the page.
  }
}

// ─────────────────────────── text to speech ───────────────────────────

let currentUtterance: SpeechSynthesisUtterance | null = null;

export interface SpeakOptions {
  rate?: number;
  interrupt?: boolean;
  onEnd?: () => void;
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!ttsSupported || !text?.trim()) {
    options.onEnd?.();
    return;
  }
  const { rate = 1, interrupt = true, onEnd } = options;

  if (interrupt) window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = Math.max(0.5, Math.min(rate, 2));
  utterance.onend = () => {
    currentUtterance = null;
    onEnd?.();
  };
  utterance.onerror = () => {
    currentUtterance = null;
    onEnd?.();
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

/**
 * speak() + a caption, in one call. Use this everywhere a voice command's
 * response would otherwise be spoken-only (VoiceNavigator, QuizPage's and
 * LearningPage's useVoiceCommand handlers) — a deaf or hard-of-hearing student
 * navigating by voice gets exactly the same words, as an on-screen toast
 * (AccessibleNotification.tsx), instead of nothing.
 *
 * `silent: true` on the notify() call stops the toast component from speaking
 * it a second time — this function already did that.
 */
export function announce(text: string, options: SpeakOptions = {}): void {
  speak(text, options);
  notify(text, { kind: 'info', silent: true });
}

export function isSpeaking(): boolean {
  return ttsSupported && window.speechSynthesis.speaking;
}

export function stopSpeaking(): void {
  if (ttsSupported) window.speechSynthesis.cancel();
  currentUtterance = null;
}

// ─────────────────────────── speech to text ───────────────────────────

export interface ListenResult {
  transcript: string;
  confidence: number;
}

export interface Listener {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/**
 * Creates a recogniser. `continuous` keeps the mic open for hands-free use;
 * push-to-talk passes false.
 *
 * We do NOT default to always-on. An open microphone is a privacy cost the
 * student should opt into, and continuous recognition drains a laptop battery
 * noticeably.
 */
export function createListener(handlers: {
  onResult: (result: ListenResult) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  continuous?: boolean;
}): Listener | null {
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.continuous = handlers.continuous ?? false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => handlers.onStart?.();
  recognition.onend = () => handlers.onEnd?.();

  recognition.onresult = (event: any) => {
    const result = event.results[event.results.length - 1];
    if (!result?.[0]) return;
    handlers.onResult({
      transcript: String(result[0].transcript ?? '').trim(),
      // Chrome sometimes reports 0 confidence on valid results; treat it as unknown.
      confidence: Number(result[0].confidence) || 0,
    });
  };

  recognition.onerror = (event: any) => {
    // 'no-speech' and 'aborted' are normal in push-to-talk use, not failures.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    handlers.onError?.(String(event.error ?? 'unknown'));
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch {
        // start() throws if already running — harmless.
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* not running */
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        /* not running */
      }
    },
  };
}

/** Hard stop for everything audible. Bound to Escape and the "stop" command. */
export function stopAll(): void {
  stopSpeaking();
}
