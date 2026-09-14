import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CheckCircle2, HelpCircle, Loader2, PartyPopper, RotateCcw } from 'lucide-react';

import Eye from '../components/Eye';
import { useProfile } from '../hooks/useProfile';
import { scoringProfile, webcamAllowed } from '../types/profile';
import { endSession, FocusMeter, startSession, track, triggerEvaluation } from '../services/telemetry';
import { useVoiceCommand } from '../hooks/useVoiceCommand';
import { announce } from '../services/speech';

interface Question {
  questionId?: string;
  question: string;
  options: string[];
  answer: string;
  topic?: string | null;
  conceptId?: string | null;
  difficulty?: number;
  questionType?: string;
  explanation?: string | null;
  // Served by the Phase 2.4 closed loop when the error classifier reports
  // COMPREHENSION_BARRIER. Generated in Phase 1.2, unused until then.
  simplerQuestion?: string | null;
  simplerOptions?: string[] | null;
  simplerAnswer?: string | null;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const TOTAL_QUESTIONS = 10;

const QuizPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { text } = location.state || { text: '' };
  const { uid, profile, consent, loading: profileLoading } = useProfile();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  const [wrongTopics, setWrongTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [degraded, setDegraded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Non-null while the closed loop is showing the simpler variant of the current item.
  const [representing, setRepresenting] = useState<{ label: string; confidence: number } | null>(null);
  const [barriers, setBarriers] = useState(0);   // comprehension barriers detected
  const [recovered, setRecovered] = useState(0); // ...of which recovered on the variant

  // ─── telemetry state (DATA_CONTRACT §3.1) ───
  const sessionRef = useRef<string | null>(null);
  const questionStartRef = useRef<number>(Date.now());
  const firstInteractionRef = useRef<number | null>(null);
  const answerChangesRef = useRef(0);
  const focusRef = useRef(new FocusMeter());
  const focusRatiosRef = useRef<number[]>([]);
  const quizStartRef = useRef<number>(Date.now());
  // The student's own response times this session — the baseline the error
  // classifier compares against (never a cohort median).
  const priorTimesRef = useRef<number[]>([]);

  const useWebcam = !profileLoading && webcamAllowed(profile, consent);

  // Tab-switching is a real distraction signal, costs nothing, and works for every
  // student including those with no webcam. The camera only adds face-presence on top.
  useEffect(() => {
    const onHide = () => focusRef.current.set(document.visibilityState === 'visible');
    const onBlur = () => focusRef.current.set(false);
    const onFocus = () => focusRef.current.set(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!text) {
      setLoading(false);
      setLoadError('No lesson text was passed in. Start from a lesson to generate a quiz.');
      return;
    }
    // Wait for the profile — question FORMAT depends on it (blind items avoid
    // visual/spatial reasoning, deaf items minimise reading load, etc).
    if (profileLoading) return;

    axios
      .post(`${API_URL}/generate-quiz/`, {
        text,
        profile: scoringProfile(profile),
        count: TOTAL_QUESTIONS,
      })
      .then((res) => {
        const data: Question[] = (res.data.questions ?? []).slice(0, TOTAL_QUESTIONS);
        setQuestions(data);
        setDegraded(Boolean(res.data.degraded));
        if (!data.length) setLoadError('Could not build a quiz from this text. Try a longer lesson.');
      })
      .catch((err) => {
        console.error('Error fetching quiz:', err);
        setLoadError('Could not reach the quiz service. Is the backend running?');
      })
      .finally(() => setLoading(false));
  }, [text, profileLoading, profile]);

  // Open a telemetry session once we know who the student is and have questions.
  useEffect(() => {
    if (profileLoading || !uid || !questions.length || sessionRef.current) return;
    let cancelled = false;
    startSession(uid, 'quiz').then((id) => {
      if (!cancelled) {
        sessionRef.current = id;
        quizStartRef.current = Date.now();
        questionStartRef.current = Date.now();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profileLoading, uid, questions.length]);

  const resetQuestionTimers = useCallback(() => {
    questionStartRef.current = Date.now();
    firstInteractionRef.current = null;
    answerChangesRef.current = 0;
    focusRef.current.reset();
  }, []);

  const handleSelect = (option: string) => {
    if (firstInteractionRef.current === null) {
      firstInteractionRef.current = Date.now() - questionStartRef.current;
    } else if (selectedAnswer !== option) {
      // Switching between options before submitting = hesitation (contract §3.1).
      answerChangesRef.current += 1;
    }
    setSelectedAnswer(option);
  };

  const advance = useCallback(
    (correctSoFar: number) => {
      const last = currentIndex >= questions.length - 1;
      if (last) {
        const ratios = focusRatiosRef.current;
        const finishedSessionId = sessionRef.current;
        void endSession(finishedSessionId, {
          totalQuestions: questions.length,
          correct: correctSoFar,
          totalTimeMs: Date.now() - quizStartRef.current,
          completed: true,
          meanFocusRatio: ratios.length
            ? +(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(3)
            : null,
        }).then(() => {
          // Must run AFTER endSession: evaluate reads this session's events back
          // from Firestore, and scoring a session that hasn't finished writing
          // yet would compute DASE from a partial record.
          if (uid) void triggerEvaluation(finishedSessionId, uid, scoringProfile(profile));
        });
        setIsQuizCompleted(true);
      } else {
        setCurrentIndex((p) => p + 1);
        setSelectedAnswer(null);
        setRepresenting(null);
        resetQuestionTimers();
      }
    },
    [currentIndex, questions.length, resetQuestionTimers, uid, profile],
  );

  const handleSubmit = async () => {
    if (!selectedAnswer || submitting) return;
    setSubmitting(true);

    const q = questions[currentIndex];
    const onVariant = representing !== null;
    const expected = onVariant ? q.simplerAnswer : q.answer;
    const isCorrect = selectedAnswer === expected;
    const timeMs = Date.now() - questionStartRef.current;
    const { focusRatio, focusSamples } = focusRef.current.read();
    if (focusRatio !== null) focusRatiosRef.current.push(focusRatio);

    // Personal baseline must include CORRECT answers too — a median built only
    // from wrong answers is not the student's normal pace, and every "unusually
    // fast" judgement downstream would be measured against the wrong number.
    // Re-presented variants are excluded: they are easier by construction.
    if (!onVariant) priorTimesRef.current.push(timeMs);

    track({
      type: 'question',
      sessionId: sessionRef.current ?? '',
      studentId: uid ?? '',
      ts: Date.now(),
      questionId: q.questionId ?? `q${currentIndex}`,
      conceptId: q.conceptId ?? null,
      topic: q.topic ?? null,
      difficulty: q.difficulty ?? 3,
      questionType: q.questionType ?? 'mcq',
      selected: selectedAnswer,
      correct: isCorrect,
      timeMs,
      timeToFirstInteractionMs: firstInteractionRef.current,
      // attempts is part of the telemetry idempotency key, so the re-presented
      // attempt is stored as a distinct event rather than overwriting the first.
      attempts: onVariant ? 2 : 1,
      answerChanges: answerChangesRef.current,
      hintsUsed: 0,
      revisits: 0,
      reRead: false,
      focusRatio,
      focusSamples,
      isRepresentation: onVariant,
      originalQuestionId: onVariant ? q.questionId ?? `q${currentIndex}` : null,
    });

    // Only the FIRST attempt counts toward the score. Credit for the re-presented
    // variant would inflate results and make the recovery rate unmeasurable.
    const nextScore = isCorrect && !onVariant ? score + 1 : score;
    if (isCorrect && !onVariant) setScore(nextScore);

    if (isCorrect) {
      if (onVariant) {
        // Recovered on the simpler wording -> the barrier was the phrasing, not
        // the concept. This is the headline measurement (roadmap §4b).
        setRecovered((r) => r + 1);
      }
      setSubmitting(false);
      advance(nextScore);
      return;
    }

    if (q.topic) setWrongTopics((p) => [...p, q.topic as string]);

    // ─── the closed loop ───
    // Already on the variant, or none exists: nothing more to try.
    if (onVariant || !q.simplerQuestion || !q.simplerOptions?.length) {
      setSubmitting(false);
      advance(nextScore);
      return;
    }

    try {
      const { data } = await axios.post(`${API_URL}/api/classify`, {
        timeMs,
        priorTimesMs: priorTimesRef.current,
        focusRatio,
        focusSamples,
        answerChanges: answerChangesRef.current,
        timeToFirstInteractionMs: firstInteractionRef.current,
        reRead: false,
        timedOut: false,
        hasSimplerVariant: true,
      });

      if (data.shouldRepresent) {
        setRepresenting(data.classification);
        setSelectedAnswer(null);
        setBarriers((b) => b + 1);
        // Fresh timers: the variant attempt is measured on its own terms.
        questionStartRef.current = Date.now();
        firstInteractionRef.current = null;
        answerChangesRef.current = 0;
        setSubmitting(false);
        return;
      }
    } catch (err) {
      // Classification is an enhancement, never a gate. If it fails the student
      // simply moves on, exactly as they would have before Phase 2.
      console.warn('[dase] classify failed, continuing without re-presentation', err);
    }

    setSubmitting(false);
    advance(nextScore);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setWrongTopics([]);
    setIsQuizCompleted(false);
    setSelectedAnswer(null);
    focusRatiosRef.current = [];
    priorTimesRef.current = [];
    setRepresenting(null);
    setBarriers(0);
    setRecovered(0);
    sessionRef.current = null; // a retake is a new session
    resetQuestionTimers();
    if (uid) startSession(uid, 'quiz').then((id) => (sessionRef.current = id));
  };

  // ─── voice control (Phase 3) ───
  // Without this a blind student can hear the quiz but cannot answer it: the
  // options are radio inputs that need a pointer or precise tab order.
  const speakQuestion = useCallback(() => {
    const q = questions[currentIndex];
    if (!q) return;
    const stem = representing ? q.simplerQuestion ?? q.question : q.question;
    const opts = (representing ? q.simplerOptions ?? q.options : q.options) ?? [];
    const letters = ['A', 'B', 'C', 'D'];
    announce(
      `Question ${currentIndex + 1} of ${questions.length}. ${stem}. ` +
        opts.map((o, i) => `${letters[i] ?? i + 1}. ${o}.`).join(' '),
      { rate: profile.prefs.ttsRate ?? 1 },
    );
  }, [questions, currentIndex, representing, profile.prefs.ttsRate]);

  useVoiceCommand((intent, slots) => {
    const q = questions[currentIndex];
    if (!q) return;
    const opts = (representing ? q.simplerOptions ?? q.options : q.options) ?? [];

    switch (intent) {
      case 'REPEAT':
      case 'READ_ALL':
        speakQuestion();
        break;
      case 'ANSWER': {
        const idx = Number(slots.optionIndex);
        if (Number.isInteger(idx) && idx >= 0 && idx < opts.length) {
          handleSelect(opts[idx]);
          // Read the choice back. A blind student otherwise has no confirmation
          // that speech recognition picked the option they meant.
          announce(`Selected ${['A', 'B', 'C', 'D'][idx] ?? idx + 1}. ${opts[idx]}. Say submit to confirm.`, {
            rate: profile.prefs.ttsRate ?? 1,
          });
        } else {
          announce('That option does not exist. Say answer A, B, C or D.', {
            rate: profile.prefs.ttsRate ?? 1,
          });
        }
        break;
      }
      case 'SUBMIT':
        if (selectedAnswer) void handleSubmit();
        else announce('Choose an answer first. Say answer A, B, C or D.', { rate: profile.prefs.ttsRate ?? 1 });
        break;
      case 'EXPLAIN':
        announce(q.explanation ?? 'No explanation is available for this question yet.', {
          rate: profile.prefs.ttsRate ?? 1,
        });
        break;
      default:
        break;
    }
  });

  // Read each new question aloud automatically when TTS is on.
  useEffect(() => {
    if (!profile.prefs.ttsEnabled || loading || profileLoading) return;
    if (!questions.length) return;
    speakQuestion();
    // Keyed on the question actually shown, including the re-presented variant.
  }, [currentIndex, representing, questions.length, profile.prefs.ttsEnabled, loading, profileLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || profileLoading) {
    return (
      <div
        className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-lg text-slate-600"
        role="status"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" aria-hidden="true" />
        Loading quiz…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl bg-white rounded-card shadow-md p-8 border border-slate-100 text-center">
        <p className="text-slate-700 mb-4">{loadError}</p>
        <button
          onClick={() => navigate('/student-dashboard')}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-control font-semibold min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </button>
      </div>
    );
  }

  if (isQuizCompleted) {
    const uniqueWeakAreas = [...new Set(wrongTopics)];
    return (
      <div className="mx-auto max-w-2xl bg-white rounded-card shadow-md p-8 border border-slate-100">
        <div className="flex justify-center mb-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-50 text-success-600">
            <PartyPopper className="h-7 w-7" aria-hidden="true" />
          </span>
        </div>
        <h2 className="text-3xl font-semibold text-primary-800 mb-2 text-center">Quiz complete</h2>
        <p className="text-lg text-slate-700 text-center mb-6">
          Your score: <b>{score}/{questions.length}</b>
        </p>

        {barriers > 0 && (
          <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-5">
            <h3 className="text-lg font-semibold text-sky-900 mb-1">Question wording</h3>
            <p className="text-sm text-sky-900">
              {recovered} of {barriers}{' '}
              {barriers === 1 ? 'question' : 'questions'} you missed turned out to be about the
              wording, not the idea — you got {recovered === 1 ? 'it' : 'them'} right once the
              question was reworded.
            </p>
          </div>
        )}

        {uniqueWeakAreas.length > 0 ? (
          <div className="bg-primary-50 rounded-xl p-5 border border-primary-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Focus areas to improve</h3>
            <ul className="list-disc ml-6 text-slate-700">
              {uniqueWeakAreas.map((topic, i) => (
                <li key={i}>{topic}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-success-600 text-lg font-medium text-center">
            Nice work. Keep going!
          </p>
        )}

        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={handleRestart}
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-control font-semibold min-h-[44px]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retry quiz
          </button>
          <button
            onClick={() => navigate('/student-dashboard')}
            className="inline-flex items-center gap-2 bg-success-500 hover:bg-success-600 text-white px-5 py-2.5 rounded-control font-semibold min-h-[44px]"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = Math.round(((currentIndex + 1) / questions.length) * 100);
  // While the closed loop is active, the student sees the simpler variant of the
  // SAME concept rather than moving on.
  const shownQuestion = representing
    ? currentQuestion?.simplerQuestion ?? currentQuestion?.question
    : currentQuestion?.question;
  const shownOptions = representing
    ? currentQuestion?.simplerOptions ?? currentQuestion?.options
    : currentQuestion?.options;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {useWebcam && (
        <aside className="lg:w-64 w-full shrink-0">
          <div className="bg-white rounded-card shadow-md p-4 border border-slate-100">
            {/* No heading here — same duplicate-title bug fixed in LearningPage:
                <Eye> already renders its own "Focus Tracker" title. */}
            <Eye onFocusChange={(focused) => focusRef.current.set(focused)} />
          </div>
        </aside>
      )}

      <div className="flex-1 mx-auto max-w-3xl w-full bg-white rounded-card shadow-md p-8 border border-slate-100">
        {degraded && (
          <p className="mb-4 text-sm text-warning-800 bg-warning-50 border border-warning-200 rounded-control px-4 py-2.5">
            These questions were generated by the basic fallback, not the AI tutor. They may be
            lower quality, and results from this quiz are excluded from your learning profile.
          </p>
        )}
        <h2 className="flex items-center justify-center gap-2 text-2xl font-semibold text-primary-800 mb-1 text-center">
          <HelpCircle className="h-6 w-6" aria-hidden="true" />
          Quiz time
        </h2>
        <p className="text-slate-600 text-center mb-4">
          Question {currentIndex + 1} of {questions.length}
        </p>

        <div
          className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden mb-6"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-2 bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
        </div>

        {representing && (
          <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
            <p className="text-sm text-sky-900">
              <strong>Let us try that another way.</strong> Same idea, simpler words — take your time.
            </p>
          </div>
        )}

        <fieldset>
          <legend className="text-xl font-semibold mb-5 text-center text-slate-800 w-full">
            {shownQuestion}
          </legend>

          <div className="flex flex-col gap-3">
            {shownOptions?.map((option, index) => (
              <label
                key={index}
                className={`flex items-center gap-3 p-4 border rounded-control cursor-pointer transition min-h-[44px]
                  ${
                    selectedAnswer === option
                      ? 'bg-primary-50 border-primary-400 ring-2 ring-primary-200'
                      : 'hover:bg-slate-50 border-slate-200'
                  }`}
              >
                <input
                  type="radio"
                  name="quiz"
                  value={option}
                  checked={selectedAnswer === option}
                  onChange={() => handleSelect(option)}
                  className="h-4 w-4 accent-primary-600"
                />
                {/* Voice commands ("answer A/B/C/D") reference letters that had
                    no visual counterpart anywhere in the UI — a sighted student
                    had no way to know what to say. */}
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold"
                  aria-hidden="true"
                >
                  {['A', 'B', 'C', 'D'][index] ?? index + 1}
                </span>
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-center mt-6">
          <button
            onClick={handleSubmit}
            disabled={!selectedAnswer || submitting}
            className={`px-6 py-2.5 font-semibold rounded-control min-h-[44px]
              ${
                selectedAnswer
                  ? 'bg-success-500 hover:bg-success-600 text-white'
                  : 'bg-slate-300 text-slate-600 cursor-not-allowed'
              }`}
          >
            {submitting ? 'Checking…' : currentIndex === questions.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizPage;
