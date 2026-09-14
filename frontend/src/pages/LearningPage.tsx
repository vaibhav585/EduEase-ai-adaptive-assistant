import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Eye from '../components/Eye';
// Lazy: mermaid pulls in ~700KB of diagram-layout code (elk, cytoscape, katex
// sub-renderers). Statically importing VisualSummary put that in the MAIN
// bundle for every single user on every page load, not just the deaf/hoh
// students who actually see the button — measured, this took the main chunk
// from 1.24MB to 1.91MB. Lazy means it only downloads when the button renders.
const VisualSummary = React.lazy(() => import('../components/VisualSummary'));
import { useProfile } from '../hooks/useProfile';
import { scoringProfile, webcamAllowed } from '../types/profile';
import { endSession, FocusMeter, startSession, track } from '../services/telemetry';
import { useVoiceCommand } from '../hooks/useVoiceCommand';
import { announce, stopSpeaking } from '../services/speech';
import { notify } from '../services/notify';
import {
  BookOpen,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// Shape returned by backend/services/image_describer.py, threaded through
// UploadForm's navigate() call. Generated since Phase 3 but never rendered
// anywhere until now — described images existed, with nowhere to see or hear them.
interface DescribedImage {
  page: number;
  name: string;
  description: string;
  degraded: boolean;
}

const LearningPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { text, images } = (location.state as { text?: string; images?: DescribedImage[] }) || {};
  const { uid, profile, consent, loading: profileLoading } = useProfile();

  const [words, setWords] = React.useState<string[]>([]);
  const [sentences, setSentences] = React.useState<string[][]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = React.useState(0);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [simplifiedText, setSimplifiedText] = React.useState<string | null>(null);
  const [highlightMode, setHighlightMode] = React.useState<'word' | 'sentence'>('word');
  const [wpm, setWpm] = React.useState(200);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [readability, setReadability] = React.useState<{
    before: number | null;
    after: number | null;
    degraded: boolean;
  } | null>(null);

  // ─── reading telemetry (DATA_CONTRACT §3.2) ───
  const sessionRef = React.useRef<string | null>(null);
  const startedAtRef = React.useRef<number>(Date.now());
  const replaysRef = React.useRef(0);
  const pauseCountRef = React.useRef(0);
  const ttsUsedRef = React.useRef(false);
  const focusRef = React.useRef(new FocusMeter());
  const useWebcam = !profileLoading && webcamAllowed(profile, consent);
  const isDeafOrHoh = profile.disabilities.some((d) => d === 'deaf' || d === 'hard_of_hearing');

  React.useEffect(() => {
    if (profileLoading || !uid || sessionRef.current) return;
    let cancelled = false;
    startSession(uid, 'reading').then((id) => {
      if (!cancelled) {
        sessionRef.current = id;
        startedAtRef.current = Date.now();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profileLoading, uid]);

  /** Words consumed so far — feeds READ_FL (reading fluency) in Phase 2. */
  const wordsRead = React.useCallback(
    () => sentences.slice(0, currentSentenceIndex).reduce((n, s) => n + s.length, 0) + currentIndex,
    [sentences, currentSentenceIndex, currentIndex],
  );

  const emitReading = React.useCallback(() => {
    if (!sessionRef.current || !uid) return;
    const { focusRatio, focusSamples } = focusRef.current.read();
    track({
      type: 'reading',
      sessionId: sessionRef.current,
      studentId: uid,
      ts: Date.now(),
      contentId: null,
      wordsRead: wordsRead(),
      wpmSetting: wpm,
      elapsedMs: Date.now() - startedAtRef.current,
      replays: replaysRef.current,
      ttsUsed: ttsUsedRef.current,
      pauseCount: pauseCountRef.current,
      focusRatio,
      focusSamples,
      simplifyProfile: scoringProfile(profile),
    });
  }, [uid, wpm, wordsRead, profile]);

  // Emit on unmount so navigating away (including to the quiz) still records the read.
  React.useEffect(() => () => emitReading(), [emitReading]);

  React.useEffect(() => {
    // Wait for the profile before simplifying, or every student gets the
    // "default" rewrite and the whole personalisation is a no-op.
    if (!text || profileLoading) return;

    axios
      .post(`${API_URL}/simplify-text/`, { text, profile: scoringProfile(profile) })
      .then((response) => {
        const simplified: string = response.data.simplified_text ?? '';
        setSimplifiedText(simplified);
        setReadability({
          before: response.data.before?.gradeLevel ?? null,
          after: response.data.after?.gradeLevel ?? null,
          degraded: Boolean(response.data.degraded),
        });
        const splitSentences = simplified
          .split(/(?<=[.!?])\s+/)
          .filter((s: string) => s.trim())
          .map((s: string) => s.split(' '));
        setSentences(splitSentences);
        setWords(splitSentences[0] || []);
      })
      .catch((error) => console.error('Error simplifying text:', error));
  }, [text, profileLoading, profile]);

  // Settings' "Read lessons aloud automatically" toggle (profile.prefs.ttsEnabled)
  // was only ever wired into QuizPage — LearningPage never read it at all, so
  // turning it on and opening a lesson did nothing. Reported directly by the
  // user; fixed by reading the whole simplified text aloud as soon as it's
  // ready, the same way the READ_ALL voice command already does.
  const autoReadForRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!profile.prefs.ttsEnabled || !simplifiedText) return;
    // Guard against re-firing on every re-render (profile object identity
    // changes on unrelated pref saves) — only speak once per new lesson text.
    if (autoReadForRef.current === simplifiedText) return;
    autoReadForRef.current = simplifiedText;
    ttsUsedRef.current = true;
    announce(simplifiedText, { rate: profile.prefs.ttsRate ?? 1 });
  }, [simplifiedText, profile.prefs.ttsEnabled, profile.prefs.ttsRate]);

  React.useEffect(() => {
    if (sentences.length > 0) {
      setWords(sentences[currentSentenceIndex]);
      setCurrentIndex(0);
    }
  }, [currentSentenceIndex, sentences]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isPlaying) {
      const delay = 60000 / wpm;
      interval = setInterval(() => {
        if (highlightMode === 'word') {
          setCurrentIndex((prev) => {
            const next = prev + 1;
            if (next < words.length) return next;
            setCurrentSentenceIndex((ps) => {
              const ns = ps + 1;
              if (ns < sentences.length) return ns;
              setIsPlaying(false);
              return ps;
            });
            return 0;
          });
        } else {
          setCurrentSentenceIndex((ps) => {
            const ns = ps + 1;
            if (ns < sentences.length) return ns;
            setIsPlaying(false);
            return ps;
          });
        }
      }, delay);
    } else if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    return () => interval && clearInterval(interval);
  }, [isPlaying, wpm, highlightMode, words.length, sentences.length]);

  const handlePlayPause = () => {
    if (isPlaying) pauseCountRef.current += 1;
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    replaysRef.current += 1; // re-reading from the top is a comprehension signal
    setCurrentSentenceIndex(0);
    setCurrentIndex(0);
    setIsPlaying(false);
    if (speechSynthesis.speaking) speechSynthesis.cancel();
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      ttsUsedRef.current = true;
      const spokenText = highlightMode === 'word'
        ? words[currentIndex]
        : sentences[currentSentenceIndex].join(' ');
      const utterance = new SpeechSynthesisUtterance();
      utterance.lang = 'en-US';
      utterance.rate = profile.prefs.ttsRate;
      utterance.text = spokenText;
      speechSynthesis.speak(utterance);
      // This button uses the raw browser API directly (for per-word playback
      // timing announce() doesn't support), so it needs its own caption call —
      // silent: true since the utterance above already speaks it.
      notify(spokenText, { kind: 'info', silent: true });
    } else {
      // Was alert() — blocking, unstyleable, and gave a deaf student the exact
      // same disruptive dialog as everyone else for a message that is moot to
      // them anyway. notify() renders it as a dismissible toast instead.
      notify('Text-to-speech is not supported in this browser.', { kind: 'error' });
    }
  };

  // ─── voice control (Phase 3) ───
  useVoiceCommand((intent) => {
    const rate = profile.prefs.ttsRate ?? 1;
    const sentence = (i: number) => (sentences[i] ?? []).join(' ');

    switch (intent) {
      case 'READ_ALL':
        ttsUsedRef.current = true;
        announce(simplifiedText ?? 'The lesson is still loading.', { rate });
        break;
      case 'READ_NEXT':
        setCurrentSentenceIndex((i) => {
          const next = Math.min(i + 1, sentences.length - 1);
          ttsUsedRef.current = true;
          announce(sentence(next), { rate });
          return next;
        });
        break;
      case 'READ_PREVIOUS':
        setCurrentSentenceIndex((i) => {
          const prev = Math.max(i - 1, 0);
          ttsUsedRef.current = true;
          announce(sentence(prev), { rate });
          return prev;
        });
        break;
      case 'REPEAT':
        ttsUsedRef.current = true;
        announce(sentence(currentSentenceIndex), { rate });
        break;
      case 'FASTER':
        setWpm((w) => Math.min(w + 50, 500));
        announce('Reading faster.', { rate });
        break;
      case 'SLOWER':
        setWpm((w) => Math.max(w - 50, 50));
        announce('Reading slower.', { rate });
        break;
      case 'STOP':
        stopSpeaking();
        setIsPlaying(false);
        break;
      default:
        break;
    }
  });

  const navigateToQuiz = useCallback(() => {
    if (!simplifiedText) return; // button is disabled until ready; no alert needed
    emitReading();
    void endSession(sessionRef.current, {
      totalQuestions: 0,
      correct: 0,
      totalTimeMs: Date.now() - startedAtRef.current,
      completed: true,
      meanFocusRatio: focusRef.current.read().focusRatio,
    });
    navigate('/quiz', { state: { text: simplifiedText } });
  }, [navigate, simplifiedText, emitReading]);

  const renderContent = () => {
    if (!simplifiedText) return <p className="text-slate-500">Loading content...</p>;
    if (highlightMode === 'word') {
      const currentSentenceWords = sentences[currentSentenceIndex] || [];
      return (
        <div className="text-3xl sm:text-4xl font-semibold mb-6 min-h-[2.5rem] leading-snug tracking-wide">
          {currentSentenceWords.map((word, idx) => (
            <span
              key={idx}
              className={idx === currentIndex ? 'bg-warning-200 px-2 rounded-md shadow-sm' : ''}
            >
              {word}{' '}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="text-xl sm:text-2xl font-semibold mb-6 leading-relaxed tracking-wide">
        {sentences.map((sentenceWords, sIdx) => (
          <span
            key={sIdx}
            className={sIdx === currentSentenceIndex ? 'bg-success-200/70 px-2 rounded-md shadow-sm' : ''}
          >
            {sentenceWords.join(' ')}{' '}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Focus Tracker — only when the student opted in and it can actually help them */}
      {useWebcam && (
        <div className="lg:w-1/3 w-full">
          <div className="bg-white rounded-card shadow-md p-4 border border-slate-100">
            {/* No heading here — <Eye> renders its own "Focus Tracker" title in
                every one of its states (loading/error/calibrating/tracking).
                A second one here was a duplicate stacked directly above it. */}
            <Eye
              targetId="reading-area"
              onFocusChange={(isFocused) => {
                focusRef.current.set(isFocused);
                if (!isFocused && isPlaying) setIsPlaying(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Reading Module */}
      <div className={useWebcam ? 'lg:w-2/3 w-full' : 'w-full'}>
        <div className="bg-white rounded-card shadow-md p-6 border border-slate-100">
          <h2 className="flex items-center justify-center gap-2 text-2xl font-semibold text-primary-800 mb-4 text-center">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
            Learning Module
          </h2>

          {/* Controls */}
          <div className="mb-5 flex flex-wrap justify-center items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Highlight Mode:</label>
              <select
                value={highlightMode}
                onChange={(e) => setHighlightMode(e.target.value as 'word' | 'sentence')}
                className="p-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="word">Word by Word</option>
                <option value="sentence">Sentence by Sentence</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="wpm-slider" className="text-sm text-slate-600">WPM: {wpm}</label>
              <input
                id="wpm-slider"
                type="range"
                min="50"
                max="500"
                step="10"
                value={wpm}
                onChange={(e) => setWpm(Number(e.target.value))}
                className="w-48 accent-primary-600"
              />
            </div>
          </div>

          {/* Readability gain — shows the adaptation actually did something */}
          {readability?.degraded && (
            <p className="mb-4 text-sm text-warning-800 bg-warning-50 border border-warning-200 rounded-lg px-4 py-2.5">
              Showing the original text — the simplifier is unavailable right now.
            </p>
          )}
          {readability && !readability.degraded && readability.before != null && (
            <p className="mb-4 text-sm text-success-800 bg-success-50 border border-success-200 rounded-lg px-4 py-2.5">
              Adapted for <strong>{scoringProfile(profile)}</strong> — reading level{' '}
              <strong>grade {readability.before}</strong> → <strong>grade {readability.after}</strong>
            </p>
          )}

          {/* Described images (Phase 3 image_describer.py — generated at upload,
              never surfaced in the UI before this). Educational explanations,
              not alt-text: see backend/services/image_describer.py. */}
          {images && images.length > 0 && (
            <div className="mb-4 rounded-control border border-sky-100 bg-sky-50/70 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-900 mb-2">
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                Images in this lesson ({images.length})
              </h3>
              <ul className="space-y-2">
                {images.map((img, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-sky-900">
                    <span className="text-xs font-semibold text-sky-600 shrink-0 mt-0.5">
                      p.{img.page}
                    </span>
                    <span className="flex-1">{img.description}</span>
                    <button
                      type="button"
                      onClick={() => {
                        ttsUsedRef.current = true;
                        announce(img.description, { rate: profile.prefs.ttsRate ?? 1 });
                      }}
                      aria-label={`Read image description for page ${img.page} aloud`}
                      className="shrink-0 flex h-8 w-8 items-center justify-center rounded-control text-sky-700 hover:bg-sky-100"
                    >
                      <Volume2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reading Area */}
          <div id="reading-area" className="bg-primary-50/60 rounded-control p-4 border border-primary-100">
            {renderContent()}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap justify-center gap-3 mt-5">
            <button
              onClick={handlePlayPause}
              className="inline-flex items-center gap-2 bg-success-500 hover:bg-success-600 text-white font-semibold py-2.5 px-4 rounded-control min-h-[44px]"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 bg-danger-500 hover:bg-danger-600 text-white font-semibold py-2.5 px-4 rounded-control min-h-[44px]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </button>
            <button
              onClick={handleSpeak}
              className="inline-flex items-center gap-2 bg-warning-500 hover:bg-warning-600 text-white font-semibold py-2.5 px-4 rounded-control min-h-[44px]"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              Speak
            </button>
            <button
              onClick={navigateToQuiz}
              disabled={!simplifiedText}
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-5 rounded-control min-h-[44px]"
            >
              {simplifiedText ? (
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {simplifiedText ? 'Take a Quiz' : 'Preparing lesson…'}
            </button>
          </div>
        </div>

        {/* Deaf/hard-of-hearing learners are visual-first (research doc §1) —
            on-demand only, never fired automatically: see visual_generator.py. */}
        {isDeafOrHoh && simplifiedText && (
          <div className="mt-6">
            <React.Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
              <VisualSummary text={simplifiedText} profile={scoringProfile(profile)} />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningPage;
