import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

import { useProfile } from '../hooks/useProfile';
import { track } from '../services/telemetry';
import {
  announce,
  createListener,
  Listener,
  playCue,
  stopSpeaking,
  sttSupported,
  ttsSupported,
} from '../services/speech';
import { notify } from '../services/notify';
import { describeCurrentPage, matchIntent, PAGE_SUMMARIES } from '../services/voiceIntents';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

type State = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Global voice command layer for blind and low-vision students.
 *
 * Push-to-talk by DEFAULT, hands-free only on explicit opt-in. An always-open
 * microphone is a privacy cost and a battery cost, and it is not ours to impose
 * by default even on users who benefit most from it.
 *
 * Commands are matched locally first (services/voiceIntents). The backend LLM
 * fallback is only called when local rules miss — the Gemini free tier is 5
 * requests/minute, so a per-utterance LLM call would exhaust it in under a minute.
 */
const VoiceNavigator: React.FC = () => {
  const { uid, profile, loading } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState<State>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [handsFree, setHandsFree] = useState(false);

  const listenerRef = useRef<Listener | null>(null);
  const repeatsRef = useRef(0);
  const lastSpokenRef = useRef('');
  const commandStartRef = useRef<number>(0);
  const handsFreeRef = useRef(false);

  const enabled = !loading && profile.prefs.voiceNav;
  const rate = profile.prefs.ttsRate ?? 1;

  /** Speak, mirror into an ARIA live region (NVDA/JAWS users with their own
   *  screen reader), AND caption it via notify() (deaf/hard-of-hearing users,
   *  for whom the ARIA region and the audio are both unreachable). */
  const say = useCallback(
    (text: string, onEnd?: () => void) => {
      lastSpokenRef.current = text;
      setAnnouncement(text);
      setState('speaking');
      announce(text, {
        rate,
        onEnd: () => {
          setState('idle');
          onEnd?.();
          // Hands-free: reopen the mic once we stop talking, or the student has
          // to wait for silence before being heard.
          if (handsFreeRef.current) listenerRef.current?.start();
        },
      });
    },
    [rate],
  );

  const logVoice = useCallback(
    (payload: {
      transcript: string;
      sttConfidence: number;
      intent: string;
      intentSource: string;
      intentConfidence: number;
      understood: boolean;
      actionMs: number | null;
      route?: string | null;
    }) => {
      if (!uid) return;
      track({
        type: 'voice',
        sessionId: `voice-${uid}`,
        studentId: uid,
        ts: Date.now(),
        repeats: repeatsRef.current,
        route: payload.route ?? location.pathname,
        ...payload,
      } as never);
    },
    [uid, location.pathname],
  );

  const runIntent = useCallback(
    async (transcript: string, sttConfidence: number) => {
      setLastTranscript(transcript);
      commandStartRef.current = Date.now();

      // 1) local rules — instant, free, cannot hallucinate a destination
      let result = matchIntent(transcript);

      // 2) LLM fallback only if the rules missed
      if (!result) {
        setState('thinking');
        playCue('thinking');
        // No accompanying say() at this point — nothing to speak yet, so this
        // is the deaf-facing twin on its own (silent: no TTS content to give it).
        notify('Understanding your command…', { kind: 'thinking', silent: true });
        try {
          const { data } = await axios.post(`${API_URL}/api/voice/intent`, {
            text: transcript,
            allowLlm: true,
          });
          if (data.intent && data.intent !== 'UNKNOWN') {
            result = { intent: data.intent, slots: data.slots ?? {}, source: 'llm', confidence: data.confidence };
          }
        } catch {
          /* fall through to not-understood */
        }
      }

      if (!result) {
        repeatsRef.current += 1;
        playCue('error');
        logVoice({
          transcript,
          sttConfidence,
          intent: 'UNKNOWN',
          intentSource: 'none',
          intentConfidence: 0,
          understood: false,
          actionMs: null,
        });
        say(
          repeatsRef.current > 1
            ? 'Still did not catch that. Say help to hear what you can ask for.'
            : 'Sorry, I did not catch that.',
        );
        return;
      }

      repeatsRef.current = 0;
      playCue('success');

      const { intent, slots } = result;
      let route: string | null = null;

      switch (intent) {
        case 'STOP':
          stopSpeaking();
          setState('idle');
          playCue('speaking');
          notify('Stopped.', { kind: 'info', silent: true });
          break;

        case 'NAVIGATE': {
          route = String(slots.path ?? '');
          const name = String(slots.target ?? 'that page');
          navigate(route);
          say(`Opening ${name}.`);
          break;
        }

        case 'DESCRIBE_PAGE':
          say(describeCurrentPage(location.pathname));
          break;

        case 'PROGRESS':
          say('Fetching your progress.');
          window.dispatchEvent(new CustomEvent('voice:progress'));
          break;

        case 'HELP':
          say(
            'You can say: go to my quizzes, go to my lessons, or go to my dashboard. ' +
              'While reading, say read next, repeat, or read everything. ' +
              'In a quiz, say answer A, B, C or D, then say submit. ' +
              'Say stop at any time to make me quiet.',
          );
          break;

        case 'REPEAT':
          say(lastSpokenRef.current || 'There is nothing to repeat yet.');
          break;

        default:
          // Page-local commands (READ_NEXT, ANSWER, SUBMIT, EXPLAIN, FASTER...).
          // The page that owns the content handles these; the navigator only
          // routes them so it does not need to know about quiz or lesson state.
          window.dispatchEvent(new CustomEvent('voice:command', { detail: { intent, slots } }));
          break;
      }

      logVoice({
        transcript,
        sttConfidence,
        intent,
        intentSource: result.source,
        intentConfidence: result.confidence,
        understood: true,
        actionMs: Date.now() - commandStartRef.current,
        route,
      });
    },
    [navigate, location.pathname, say, logVoice],
  );

  // ── build the recogniser
  useEffect(() => {
    if (!enabled || !sttSupported) return;

    const listener = createListener({
      continuous: false,
      onStart: () => {
        setState('listening');
        playCue('listening');
        notify('Listening…', { kind: 'listening', silent: true });
      },
      onEnd: () => setState((s) => (s === 'listening' ? 'idle' : s)),
      onResult: ({ transcript, confidence }) => void runIntent(transcript, confidence),
      onError: (err) => {
        setState('idle');
        playCue('error');
        if (err === 'not-allowed') {
          say('I need microphone permission to take voice commands.');
          setHandsFree(false);
        } else {
          // Not routed through say() — there's no useful spoken explanation
          // for e.g. a 'network' or 'audio-capture' error, but a deaf student
          // still needs to know SOMETHING went wrong rather than silence.
          notify('Voice command error. Please try again.', { kind: 'error', silent: true });
        }
      },
    });

    listenerRef.current = listener;
    return () => {
      listener?.abort();
      listenerRef.current = null;
    };
  }, [enabled, runIntent, say]);

  useEffect(() => {
    handsFreeRef.current = handsFree;
    if (handsFree) listenerRef.current?.start();
    else listenerRef.current?.stop();
  }, [handsFree]);

  // ── global keys: Escape always silences, Ctrl+Shift+V is push-to-talk
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopSpeaking();
        setState('idle');
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        stopSpeaking();
        listenerRef.current?.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  // ── announce the page on arrival, so "where am I" is answered before it is asked
  useEffect(() => {
    if (!enabled) return;
    const summary = PAGE_SUMMARIES[location.pathname];
    if (summary) say(summary.short);
    // Intentionally keyed on pathname only: re-announcing on every render would
    // talk over the student constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, enabled]);

  if (!enabled) return null;

  const unsupported = !sttSupported || !ttsSupported;

  return (
    <>
      {/* Mirrors every spoken message for users running their own screen reader. */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {lastTranscript && (
          <p className="rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs text-white max-w-[16rem]">
            “{lastTranscript}”
          </p>
        )}

        {unsupported ? (
          <p className="rounded-lg bg-warning-100 border border-warning-300 px-3 py-2 text-xs text-warning-900 max-w-[16rem]">
            Voice commands need Chrome or Edge. Keyboard navigation works everywhere.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHandsFree((v) => !v)}
              aria-pressed={handsFree}
              className="rounded-full bg-white border border-slate-300 px-4 py-2.5 text-sm font-medium shadow-lg hover:bg-slate-50 min-h-[44px]"
            >
              {handsFree ? 'Hands-free on' : 'Hands-free off'}
            </button>

            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                listenerRef.current?.start();
              }}
              aria-label="Speak a command. Keyboard shortcut: Control Shift V"
              className={`rounded-full px-5 py-3 text-white font-semibold shadow-lg min-h-[44px] min-w-[44px] transition
                ${
                  state === 'listening'
                    ? 'bg-danger-600 animate-pulse'
                    : state === 'thinking'
                      ? 'bg-warning-500'
                      : state === 'speaking'
                        ? 'bg-success-600'
                        : 'bg-primary-600 hover:bg-primary-700'
                }`}
            >
              {state === 'listening'
                ? 'Listening…'
                : state === 'thinking'
                  ? 'Thinking…'
                  : state === 'speaking'
                    ? 'Speaking…'
                    : 'Speak'}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default VoiceNavigator;
