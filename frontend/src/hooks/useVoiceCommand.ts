import { useEffect, useRef } from 'react';

/**
 * Subscribe to page-local voice commands dispatched by VoiceNavigator.
 *
 * The navigator owns the microphone and the global intents (navigate, stop,
 * help). Intents that need page state — read the next paragraph, answer B,
 * submit — are dispatched as a window event and handled here, so the navigator
 * never has to know about quiz or lesson internals.
 */
export function useVoiceCommand(
  handler: (intent: string, slots: Record<string, unknown>) => void,
): void {
  // Kept in a ref so a handler that closes over changing state does not need to
  // tear down and re-add the listener on every render.
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent).detail ?? {};
      if (detail.intent) ref.current(String(detail.intent), detail.slots ?? {});
    };
    window.addEventListener('voice:command', onCommand);
    return () => window.removeEventListener('voice:command', onCommand);
  }, []);
}
