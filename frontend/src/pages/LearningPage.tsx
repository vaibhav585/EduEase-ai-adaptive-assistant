import React, { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Eye from '../components/Eye';
import type { Sentiment } from '../components/Eye';
import Chatbot from '../components/Chatbot';

const LearningPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { text, grade_level, reading_difficulty } = location.state || { text: '', grade_level: null, reading_difficulty: null };
  const [latestSentiment, setLatestSentiment] = React.useState<Sentiment | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const [words, setWords] = React.useState<string[]>([]);
  const [sentences, setSentences] = React.useState<string[][]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = React.useState(0);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [simplifiedText, setSimplifiedText] = React.useState<string | null>(null);
  const [highlightMode, setHighlightMode] = React.useState<'word' | 'sentence'>('word');
  const [wpm, setWpm] = React.useState(200);
  const [isPlaying, setIsPlaying] = React.useState(false);

  React.useEffect(() => {
    if (text) {
      api.post('/simplify-text/', { text, grade_level: grade_level ?? null, reading_difficulty: reading_difficulty ?? null })
        .then((response) => {
          const simplified = response.data.simplified_text;
          setSimplifiedText(simplified);
          const splitSentences = simplified.split(/(?<=[.!?])\s+/).map((s: string) => s.split(' '));
          setSentences(splitSentences);
          setWords(splitSentences[0] || []);
        })
        .catch((error) => console.error('Error simplifying text:', error));
    }
  }, [text, grade_level, reading_difficulty]);

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

  const handlePlayPause = () => setIsPlaying(!isPlaying);

  const handleReset = () => {
    setCurrentSentenceIndex(0);
    setCurrentIndex(0);
    setIsPlaying(false);
    if (speechSynthesis.speaking) speechSynthesis.cancel();
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance();
      utterance.lang = 'en-US';
      utterance.rate = 1;
      utterance.text = highlightMode === 'word'
        ? words[currentIndex]
        : sentences[currentSentenceIndex].join(' ');
      speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech not supported in your browser.');
    }
  };

  const navigateToQuiz = useCallback(() => {
    if (simplifiedText) navigate('/quiz', { state: { text: simplifiedText } });
    else alert('Please wait for the text to be simplified before taking the quiz.');
  }, [navigate, simplifiedText]);

  const renderContent = () => {
    if (!simplifiedText) return <p className="text-slate-500" role="status">Loading content...</p>;
    if (highlightMode === 'word') {
      const currentSentenceWords = sentences[currentSentenceIndex] || [];
      return (
        <div
          className="text-3xl sm:text-4xl font-semibold mb-6 min-h-[2.5rem] leading-snug tracking-wide"
          aria-label={`Sentence ${currentSentenceIndex + 1} of ${sentences.length}, word ${currentIndex + 1} of ${currentSentenceWords.length}`}
        >
          {currentSentenceWords.map((word, idx) => (
            <span
              key={idx}
              aria-current={idx === currentIndex ? "true" : undefined}
              className={idx === currentIndex ? 'bg-amber-200 px-2 rounded-md shadow-sm' : ''}
            >
              {word}{' '}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div
        className="text-xl sm:text-2xl font-semibold mb-6 leading-relaxed tracking-wide"
        aria-label={`Sentence ${currentSentenceIndex + 1} of ${sentences.length}`}
      >
        {sentences.map((sentenceWords, sIdx) => (
          <span
            key={sIdx}
            aria-current={sIdx === currentSentenceIndex ? "true" : undefined}
            className={sIdx === currentSentenceIndex ? 'bg-emerald-200/70 px-2 rounded-md shadow-sm' : ''}
          >
            {sentenceWords.join(' ')}{' '}
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="relative animate-fade-in flex flex-col lg:flex-row gap-6">
        {/* Focus Tracker */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6">
          <Eye
            sentiment={latestSentiment}
            onFocusChange={(isFocused) => {
              if (!isFocused && isPlaying) setIsPlaying(false);
            }}
          />
          {/* Progress card */}
          <div className="glass-card rounded-[2rem] p-5 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest">Reading Progress</span>
              <span className="font-heading text-xs font-bold text-tertiary-fixed-dim">
                {sentences.length > 0 ? `${Math.round(((currentSentenceIndex + 1) / sentences.length) * 100)}%` : "0%"}
              </span>
            </div>
            <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-tertiary-fixed-dim rounded-full transition-all duration-500"
                style={{ width: sentences.length > 0 ? `${((currentSentenceIndex + 1) / sentences.length) * 100}%` : "0%" }}></div>
            </div>
          </div>
        </div>

        {/* Reading Module */}
        <div className="flex-1 glass-card rounded-[2rem] overflow-hidden flex flex-col shadow-2xl relative">
          {/* Toolbar */}
          <header className="p-4 md:p-5 border-b border-white/20 bg-surface-container-lowest/50 backdrop-blur-md flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-surface-container rounded-full px-3 py-1.5">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">ink_highlighter</span>
                <select value={highlightMode}
                  onChange={(e) => setHighlightMode(e.target.value as 'word' | 'sentence')}
                  className="bg-transparent border-none focus:ring-0 text-xs font-heading font-semibold text-on-surface cursor-pointer">
                  <option value="word">Word</option>
                  <option value="sentence">Sentence</option>
                </select>
              </div>
              <div className="hidden lg:flex items-center gap-2">
                <span className="text-xs text-on-surface-variant font-heading">WPM:</span>
                <input id="wpm-slider" type="range" min="50" max="500" step="10" value={wpm}
                  onChange={(e) => setWpm(Number(e.target.value))}
                  className="w-24 h-1 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary" />
                <span className="text-xs font-heading font-semibold text-primary min-w-[32px] text-center">{wpm}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSpeak}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container hover:text-on-primary transition-all">
                <span className="material-symbols-outlined">volume_up</span>
              </button>
              <button onClick={handlePlayPause}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-on-primary shadow-lg hover:scale-105 active:scale-95 transition-all">
                <span className="material-symbols-outlined">{isPlaying ? "pause" : "play_arrow"}</span>
              </button>
            </div>
          </header>

          {/* Content body */}
          <article id="reading-area" role="region" aria-label="Reading area" aria-live="polite" aria-atomic="false"
            className="flex-1 overflow-y-auto p-8 md:p-10 scroll-smooth">
            <div className="max-w-2xl mx-auto">
              {renderContent()}
            </div>
          </article>

          {/* Footer */}
          <footer className="p-4 md:p-5 border-t border-white/20 flex justify-between items-center bg-surface-bright/80 backdrop-blur-md">
            <button onClick={handleReset}
              className="flex items-center gap-1.5 font-heading text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              Reset
            </button>
            <button onClick={navigateToQuiz}
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-heading text-xs font-semibold shadow-md hover:shadow-lg transition-all active:scale-95">
              Take Quiz
            </button>
          </footer>
        </div>
      </div>

      {/* Chatbot FAB — outside content flow, viewport-fixed */}
      <button
        onClick={() => setChatOpen((prev) => !prev)}
        aria-label={chatOpen ? 'Close assistant' : 'Open assistant'}
        className="fixed bottom-4 right-4 z-[9999] w-14 h-14 rounded-full bg-primary text-on-primary shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
        style={{isolation: "isolate"}}
      >
        <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">{chatOpen ? 'close' : 'auto_awesome'}</span>
      </button>

      {chatOpen && (
        <Chatbot
          onSentiment={setLatestSentiment}
          gradeLevel={grade_level}
          readingDifficulty={reading_difficulty}
        />
      )}
    </>
  );
};

export default LearningPage;
