import React, { useEffect, useRef, useState } from 'react';

import { useProfile } from '../hooks/useProfile';
import { NotifyEventDetail } from '../services/notify';
import { speak } from '../services/speech';

/**
 * Mount once (App.tsx, alongside VoiceNavigator). Listens for notify() calls
 * and renders them according to the viewer's profile — roadmap 5.3:
 *   deaf/hard_of_hearing -> visual flash + border pulse + vibration (notify.ts
 *     already fired the vibration; this renders the visual half)
 *   blind/low_vision      -> spoken, no visual reliance (still renders the
 *     toast too, for a sighted person glancing at their screen, but the
 *     speech is what actually reaches them)
 *   everyone else          -> a plain visible toast
 *
 * This is the shared retrofit point for VoiceNavigator.tsx's audio-only state
 * cues (listening/thinking/speaking/error) — see that file's playCue() calls.
 * Without it those cues are silently unusable for a deaf student.
 */

const KIND_STYLE: Record<string, string> = {
  info: 'bg-slate-900/90 border-slate-700',
  success: 'bg-success-700/95 border-success-500',
  error: 'bg-danger-700/95 border-danger-500',
  listening: 'bg-primary-700/95 border-primary-400',
  thinking: 'bg-warning-600/95 border-warning-400',
};

const AccessibleNotification: React.FC = () => {
  const { profile, loading } = useProfile();
  const [toast, setToast] = useState<NotifyEventDetail | null>(null);
  const [flashing, setFlashing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDeaf = !loading && profile.disabilities.some((d) => d === 'deaf' || d === 'hard_of_hearing');
  const wantsSpeech = !loading && profile.prefs.ttsEnabled;

  useEffect(() => {
    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent<NotifyEventDetail>).detail;
      setToast(detail);

      if (timerRef.current) clearTimeout(timerRef.current);
      if (detail.durationMs > 0) {
        timerRef.current = setTimeout(() => setToast(null), detail.durationMs);
      }

      // Deaf/hard-of-hearing viewers get a full-screen border pulse in addition
      // to the toast — a small corner box is easy to miss if attention is
      // elsewhere on the page, and this is their only channel for the event.
      if (isDeaf) {
        setFlashing(true);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlashing(false), 600);
      }

      // Speech is additive, never the only channel — a hard-of-hearing viewer
      // may have both TTS and captions on, and the toast/caption must not
      // depend on speech succeeding. Skipped when the caller already spoke it
      // (silent: true) — e.g. services/speech.ts announce(), which calls
      // speak() itself before notify() fires; speaking again here would talk
      // over the first utterance.
      if (wantsSpeech && !isDeaf && !detail.silent) {
        speak(detail.speak, { interrupt: false });
      }
    };

    window.addEventListener('app:notify', onNotify);
    return () => {
      window.removeEventListener('app:notify', onNotify);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [isDeaf, wantsSpeech]);

  return (
    <>
      {/* Full-viewport border pulse — the deaf-facing equivalent of an audio cue.
          pointer-events-none so it never blocks the page underneath. */}
      {flashing && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[60] border-8 border-primary-500 animate-pulse"
        />
      )}

      {/* The toast itself — visible to every viewer regardless of profile, since
          a sighted-but-not-deaf viewer benefits from it too, it just isn't
          their only channel the way it is for a deaf viewer. */}
      <div aria-live="polite" aria-atomic="true" className="fixed top-4 left-1/2 -translate-x-1/2 z-[70]">
        {toast && (
          <div
            className={`rounded-xl border px-5 py-3 text-white shadow-lg max-w-sm text-center text-sm font-medium ${
              KIND_STYLE[toast.kind] ?? KIND_STYLE.info
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
};

export default AccessibleNotification;
