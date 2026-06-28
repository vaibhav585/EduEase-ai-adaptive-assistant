import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Eye from '../components/Eye';

const LearningPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { text } = location.state || { text: '' };

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
      api.post('/simplify-text/', { text })
        .then((response) => {
          const simplified = response.data.simplified_text;
          setSimplifiedText(simplified);
          const splitSentences = simplified.split(/(?<=[.!?])\s+/).map((s: string) => s.split(' '));
          setSentences(splitSentences);
          setWords(splitSentences[0] || []);
        })
        .catch((error) => console.error('Error simplifying text:', error));
    }
  }, [text]);

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
    if (!simplifiedText) return <p className="text-slate-500">Loading content...</p>;
    if (highlightMode === 'word') {
      const currentSentenceWords = sentences[currentSentenceIndex] || [];
      return (
        <div className="text-3xl sm:text-4xl font-semibold mb-6 min-h-[2.5rem] leading-snug tracking-wide">
          {currentSentenceWords.map((word, idx) => (
            <span
              key={idx}
              className={idx === currentIndex ? 'bg-amber-200 px-2 rounded-md shadow-sm' : ''}
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
            className={sIdx === currentSentenceIndex ? 'bg-emerald-200/70 px-2 rounded-md shadow-sm' : ''}
          >
            {sentenceWords.join(' ')}{' '}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Focus Tracker */}
      <div className="lg:w-1/3 w-full">
        <div className="bg-white rounded-2xl shadow-md p-4 border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 mb-3 text-center">👁️ Focus Tracker</h2>
          <Eye
            targetId="reading-area"
            onFocusChange={(isFocused) => {
              if (!isFocused && isPlaying) setIsPlaying(false);
            }}
          />
        </div>
      </div>

      {/* Reading Module */}
      <div className="lg:w-2/3 w-full">
        <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
          <h2 className="text-2xl font-semibold text-indigo-800 mb-4 text-center">📘 Learning Module</h2>

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
                className="w-48 accent-indigo-600"
              />
            </div>
          </div>

          {/* Reading Area */}
          <div id="reading-area" className="bg-indigo-50/60 rounded-xl p-4 border border-indigo-100">
            {renderContent()}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap justify-center gap-3 mt-5">
            <button
              onClick={handlePlayPause}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 px-4 rounded-lg"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={handleReset}
              className="bg-rose-500 hover:bg-rose-600 text-white font-semibold py-2 px-4 rounded-lg"
            >
              Reset
            </button>
            <button
              onClick={handleSpeak}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg"
            >
              Speak
            </button>
            <button
              onClick={navigateToQuiz}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg"
            >
              Take a Quiz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningPage;
