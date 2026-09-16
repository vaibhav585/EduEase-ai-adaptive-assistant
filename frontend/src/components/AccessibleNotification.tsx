import React, { useEffect, useRef, useState } from 'react';

import { useProfile } from '../hooks/useProfile';
import { NotifyEventDetail } from '../services/notify';

/** Mount once (App.tsx). Renders notify() calls, speaking them for
 * blind/low-vision viewers and adding a vibration cue on top for deaf ones. */

const KIND_STYLE: Record<string, string> = {
  info: 'bg-surface-container-highest/95 border-outline-variant',
  success: 'bg-tertiary-container/95 border-tertiary text-on-tertiary-container',
  error: 'bg-error-container/95 border-error text-on-error-container',
  listening: 'bg-primary-container/95 border-primary text-on-primary-container',
  thinking: 'bg-surface-container-high/95 border-outline-variant',
};

const AccessibleNotification: React.FC = () => {
  const { profile } = useProfile();
  const [items, setItems] = useState<NotifyEventDetail[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const onNotify = (e: Event) => {
      const detail = (e as CustomEvent<NotifyEventDetail>).detail;
      setItems((prev) => [...prev, detail]);

      const speechWanted =
        !detail.silent &&
        (profile.prefs.ttsEnabled || profile.disabilities.some((d) => d === 'blind' || d === 'low_vision'));
      if (speechWanted && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(detail.speak);
        u.rate = profile.prefs.ttsRate || 1;
        window.speechSynthesis.speak(u);
      }

      timers.current[detail.id] = setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== detail.id));
        delete timers.current[detail.id];
      }, detail.durationMs);
    };

    window.addEventListener('app:notify', onNotify);
    return () => window.removeEventListener('app:notify', onNotify);
  }, [profile]);

  if (!items.length) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0"
      aria-live={profile.prefs.captionsAlways ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`rounded-2xl border p-3 shadow-lg backdrop-blur-xl font-body text-sm ${
            KIND_STYLE[item.kind] ?? KIND_STYLE.info
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
};

export default AccessibleNotification;
