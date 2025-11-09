
import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
// import EyeTracking from '../components/EyeTracking'; // Temporarily commented out

const LearningPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate(); // Initialize useNavigate
  const { text } = location.state || { text: '' };
  const [words, setWords] = React.useState<string[]>([]);
  const [sentences, setSentences] = React.useState<string[][]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = React.useState(0);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [simplifiedText, setSimplifiedText] = React.useState<string | null>(null);
  const [highlightMode, setHighlightMode] = React.useState<'word' | 'sentence'>('word');
  const [wpm, setWpm] = React.useState(200); // New state for Words Per Minute
  const [isPlaying, setIsPlaying] = React.useState(false); // New state for play/pause

  React.useEffect(() => {
    if (text) {
      axios.post('http://localhost:8000/simplify-text/', { text })
        .then(response => {
          const simplified = response.data.simplified_text;
          setSimplifiedText(simplified);
          const splitSentences = simplified.split(/(?<=[.!?])\s+/).map((s: string) => s.split(' '));
          setSentences(splitSentences);
          setWords(splitSentences[0] || []);
        })
        .catch(error => {
          console.error('Error simplifying text:', error);
        });
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
      const delay = 60000 / wpm; // Milliseconds per word/sentence
      interval = setInterval(() => {
        if (highlightMode === 'word') {
          setCurrentIndex(prevIndex => {
            const nextIndex = prevIndex + 1;
            if (nextIndex < words.length) {
              return nextIndex;
            } else {
              setCurrentSentenceIndex(prevSentenceIndex => {
                const nextSentenceIndex = prevSentenceIndex + 1;
                if (nextSentenceIndex < sentences.length) {
                  return nextSentenceIndex;
                } else {
                  setIsPlaying(false); // Stop if end of document
                  return prevSentenceIndex; // Stay at the last sentence
                }
              });
              return 0; // Reset word index for new sentence
            }
          });
        } else { // sentence mode
          setCurrentSentenceIndex(prevSentenceIndex => {
            const nextSentenceIndex = prevSentenceIndex + 1;
            if (nextSentenceIndex < sentences.length) {
              return nextSentenceIndex;
            } else {
              setIsPlaying(false); // Stop if end of document
              return prevSentenceIndex; // Stay at the last sentence
            }
          });
        }
      }, delay);
    } else {
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isPlaying, wpm, highlightMode, words.length, sentences.length]); // Simplified dependencies

  const handleNextWord = () => {
    setCurrentIndex(prevIndex => {
      const nextIndex = prevIndex + 1;
      if (nextIndex < words.length) {
        return nextIndex;
      } else {
        setCurrentSentenceIndex(prevSentenceIndex => {
          const nextSentenceIndex = prevSentenceIndex + 1;
          if (nextSentenceIndex < sentences.length) {
            return nextSentenceIndex;
          } else {
            return prevSentenceIndex; // Stay at the last sentence
          }
        });
        return 0; // Reset word index for new sentence
      }
    });
  };

  const handlePrevWord = () => {
    setCurrentIndex(prevIndex => {
      if (prevIndex > 0) {
        return prevIndex - 1;
      } else {
        setCurrentSentenceIndex(prevSentenceIndex => {
          if (prevSentenceIndex > 0) {
            const newSentenceIndex = prevSentenceIndex - 1;
            // Need to update words state here for the previous sentence
            // This is a bit tricky with functional updates, might need a separate effect or direct state update
            // For now, let's just move to the previous sentence and reset word index
            return newSentenceIndex;
          } else {
            return prevSentenceIndex;
          }
        });
        return 0; // Reset word index for the start of the previous sentence
      }
    });
  };

  const handleNextSentence = () => {
    setCurrentSentenceIndex(prevSentenceIndex => {
      const nextSentenceIndex = prevSentenceIndex + 1;
      if (nextSentenceIndex < sentences.length) {
        return nextSentenceIndex;
      } else {
        return prevSentenceIndex;
      }
    });
  };

  const handlePrevSentence = () => {
    setCurrentSentenceIndex(prevSentenceIndex => {
      if (prevSentenceIndex > 0) {
        return prevSentenceIndex - 1;
      } else {
        return prevSentenceIndex;
      }
    });
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setCurrentSentenceIndex(0);
    setCurrentIndex(0);
    setIsPlaying(false);
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance();
      utterance.lang = 'en-US'; // Set language
      utterance.rate = 1; // Normal speed

      if (highlightMode === 'word') {
        utterance.text = words[currentIndex];
      } else {
        utterance.text = sentences[currentSentenceIndex].join(' ');
      }

      speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech not supported in your browser.');
    }
  };

  const navigateToQuiz = useCallback(() => {
    if (simplifiedText) {
      navigate('/quiz', { state: { text: simplifiedText } });
    } else {
      alert('Please wait for the text to be simplified before taking the quiz.');
    }
  }, [navigate, simplifiedText]); // Add dependencies

  const renderContent = () => {
    if (!simplifiedText) {
      return <p>Loading content...</p>;
    }
    if (highlightMode === 'word') {
      const currentSentenceWords = sentences[currentSentenceIndex] || [];
      return (
        <div className="text-4xl font-bold mb-8 min-h-[1.5em]">
          {currentSentenceWords.map((word, idx) => (
            <span
              key={idx}
              className={idx === currentIndex ? 'bg-yellow-300 px-2 rounded' : ''}
            >
              {word}{' '}
            </span>
          ))}
        </div>
      );
    } else { // sentence mode
      return (
        <div className="text-2xl font-bold mb-8 min-h-[3em]">
          {sentences.map((sentenceWords, sIdx) => (
            <span
              key={sIdx}
              className={sIdx === currentSentenceIndex ? 'bg-green-300 px-2 rounded' : ''}
            >
              {sentenceWords.join(' ')}{' '}
            </span>
          ))}
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      {/* <EyeTracking onGaze={handleGaze} /> */}
      <div className="max-w-2xl w-full bg-white p-8 rounded-lg shadow-md text-center">
        <h2 className="text-2xl font-bold mb-6">Learning Page</h2>

        <div className="mb-4 flex justify-center items-center space-x-4">
          <div>
            <label className="mr-2">Highlight Mode:</label>
            <select
              value={highlightMode}
              onChange={(e) => setHighlightMode(e.target.value as 'word' | 'sentence')}
              className="p-2 border rounded"
            >
              <option value="word">Word by Word</option>
              <option value="sentence">Sentence by Sentence</option>
            </select>
          </div>
          <div>
            <label htmlFor="wpm-slider" className="mr-2">WPM: {wpm}</label>
            <input
              id="wpm-slider"
              type="range"
              min="50"
              max="500"
              step="10"
              value={wpm}
              onChange={(e) => setWpm(Number(e.target.value))}
              className="w-48"
            />
          </div>
        </div>

        {renderContent()}

        <div className="flex justify-center space-x-4 mt-4">
          <button
            onClick={handlePlayPause}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={handleReset}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            Reset
          </button>
          <button
            onClick={handleSpeak}
            className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            Speak
          </button>
        </div>

        <div className="flex justify-between mt-4">
          {highlightMode === 'word' ? (
            <>
              <button
                onClick={handlePrevWord}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Previous Word
              </button>
              <button
                onClick={handleNextWord}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Next Word
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handlePrevSentence}
                className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Previous Sentence
              </button>
              <button
                onClick={handleNextSentence}
                className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Next Sentence
              </button>
            </>
          )}
        </div>
        <button
          onClick={navigateToQuiz} // Use the new handler
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-4"
        >
          Take a quiz
        </button>
      </div>
    </div>
  );
};

export default LearningPage;
