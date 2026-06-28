import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";

interface Question {
  question: string;
  options: string[];
  answer: string;
  topic?: string;
  question_type?: "fill_blank" | "true_false" | "mcq";
}

const QuizPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { text } = location.state || { text: "" };

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  const [wrongTopics, setWrongTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const MAX_QUESTIONS = 10;

  useEffect(() => {
    if (text) {
      api
        .post("/generate-quiz/", { text })
        .then((res) => {
          const data = res.data.questions.slice(0, MAX_QUESTIONS);
          setQuestions(data);
        })
        .catch((err) => console.error("Error fetching quiz:", err))
        .finally(() => setLoading(false));
    }
  }, [text]);

  const totalQuestions = questions.length;

  const getCurrentAnswer = (): string | null => {
    const q = questions[currentIndex];
    if (!q) return null;
    if (q.question_type === "fill_blank") return typedAnswer.trim() || null;
    return selectedAnswer;
  };

  const handleSubmit = () => {
    const userAnswer = getCurrentAnswer();
    if (!userAnswer) return;

    const currentQuestion = questions[currentIndex];
    const isCorrect =
      currentQuestion.question_type === "fill_blank"
        ? userAnswer.toLowerCase() === currentQuestion.answer.toLowerCase()
        : userAnswer === currentQuestion.answer;

    const topicLabel = currentQuestion.topic || currentQuestion.answer;

    if (isCorrect) {
      setScore((prev) => prev + 1);
    } else {
      setWrongTopics((prev) => [...prev, topicLabel]);
    }

    const isFinal = currentIndex >= totalQuestions - 1;
    if (!isFinal) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setTypedAnswer("");
    } else {
      const finalScore = score + (isCorrect ? 1 : 0);
      const finalWrong = isCorrect ? wrongTopics : [...wrongTopics, topicLabel];
      setIsQuizCompleted(true);
      api.post("/analytics/log-quiz/", {
        score: finalScore,
        total_questions: totalQuestions,
        wrong_topics: [...new Set(finalWrong)],
      }).catch(() => {});
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setWrongTopics([]);
    setSelectedAnswer(null);
    setTypedAnswer("");
    setIsQuizCompleted(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="font-heading text-lg text-on-surface-variant animate-pulse">Loading quiz...</p>
      </div>
    );
  }

  if (isQuizCompleted) {
    const uniqueWeakAreas = [...new Set(wrongTopics)];
    const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (pct / 100) * circumference;

    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-12 py-8 animate-fade-in">
        <div className="bento-grid">
          {/* Score Card */}
          <div className="col-span-12 md:col-span-4 glass-card rounded-3xl p-8 flex flex-col items-center text-center">
            <h3 className="font-heading text-xl font-semibold text-on-surface mb-6">Quiz Performance</h3>
            <div className="relative w-40 h-40 mb-6">
              <svg className="w-full h-full" viewBox="0 0 100 100" style={{transform: "rotate(-90deg)"}}>
                <circle cx="50" cy="50" r="45" fill="transparent" stroke="#e5eeff" strokeWidth="8" />
                <circle cx="50" cy="50" r="45" fill="transparent" stroke="#2a14b4" strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
                  style={{transition: "stroke-dashoffset 1s ease-out"}} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-heading text-4xl font-bold text-primary">{pct}%</span>
              </div>
            </div>
            <p className="text-base text-on-surface-variant font-body">{score}/{totalQuestions} correct answers</p>
          </div>

          {/* Metrics */}
          <div className="col-span-12 md:col-span-8 glass-card rounded-3xl p-8">
            <h3 className="font-heading text-xl font-semibold text-on-surface mb-6">Session Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-surface-container-low p-4 rounded-2xl">
                <span className="material-symbols-outlined text-primary mb-2 block">check_circle</span>
                <p className="text-xs text-on-surface-variant uppercase tracking-wider font-heading font-semibold">Correct</p>
                <p className="font-heading text-2xl font-bold text-on-surface">{score}</p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-2xl">
                <span className="material-symbols-outlined text-error mb-2 block">cancel</span>
                <p className="text-xs text-on-surface-variant uppercase tracking-wider font-heading font-semibold">Missed</p>
                <p className="font-heading text-2xl font-bold text-on-surface">{totalQuestions - score}</p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-2xl">
                <span className="material-symbols-outlined text-tertiary-fixed-dim mb-2 block">quiz</span>
                <p className="text-xs text-on-surface-variant uppercase tracking-wider font-heading font-semibold">Total</p>
                <p className="font-heading text-2xl font-bold text-on-surface">{totalQuestions}</p>
              </div>
            </div>
          </div>

          {/* Focus Areas */}
          {uniqueWeakAreas.length > 0 && (
            <div className="col-span-12 glass-card rounded-3xl p-8 border-l-4 border-primary">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary text-3xl">lightbulb_circle</span>
                <h3 className="font-heading text-xl font-semibold">Focus Areas to Improve</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {uniqueWeakAreas.map((topic, i) => (
                  <div key={i} className="flex items-center gap-2 bg-surface-container-low border border-primary/20 px-4 py-2 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-pulse"></span>
                    <span className="text-sm text-on-surface font-body">{topic}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="col-span-12 flex justify-center gap-4 mt-4">
            <button onClick={handleRestart}
              className="px-8 py-3 rounded-xl font-heading text-sm font-semibold border border-outline text-on-surface hover:bg-surface-variant/30 transition-all">
              Retry Quiz
            </button>
            <button onClick={() => navigate("/student-dashboard")}
              className="px-8 py-3 rounded-xl font-heading text-sm font-semibold bg-primary text-white shadow-lg hover:shadow-xl transition-all active:scale-95">
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (totalQuestions === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="font-heading text-lg text-on-surface-variant">No questions could be generated. Try a longer passage.</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = Math.round(((currentIndex + 1) / totalQuestions) * 100);

  if (!currentQuestion || !currentQuestion.options) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="font-heading text-lg text-on-surface-variant">Error loading question {currentIndex + 1}. Please restart.</p>
      </div>
    );
  }

  const qType = currentQuestion.question_type || "fill_blank";
  const typeBadge =
    qType === "mcq" ? { label: "Multiple Choice", cls: "bg-primary-fixed text-on-primary-fixed-variant" } :
    qType === "true_false" ? { label: "True or False", cls: "bg-tertiary-fixed text-on-tertiary-fixed-variant" } :
    { label: "Fill in the Blank", cls: "bg-secondary-container text-on-surface" };
  const hasAnswer = qType === "fill_blank" ? typedAnswer.trim().length > 0 : !!selectedAnswer;

  const progressCircumference = 2 * Math.PI * 40;
  const progressOffset = progressCircumference - (progress / 100) * progressCircumference;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-12 py-8 animate-fade-in">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-on-surface mb-1">Quiz Time</h1>
          <p className="text-base text-on-surface-variant font-body">
            Question {currentIndex + 1} of {totalQuestions}
          </p>
        </div>
        <div className="relative flex items-center justify-center">
          <svg className="w-20 h-20" viewBox="0 0 100 100" style={{transform: "rotate(-90deg)"}}>
            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#e5eeff" strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#2a14b4" strokeWidth="8"
              strokeLinecap="round" strokeDasharray={progressCircumference} strokeDashoffset={progressOffset}
              style={{transition: "stroke-dashoffset 0.5s ease-out"}} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-heading text-xl font-bold text-primary">{progress}%</span>
          </div>
        </div>
      </header>

      <div className="bento-grid">
        {/* Question Card */}
        <div className={`glass-card rounded-3xl p-6 md:p-8 ${qType === "fill_blank" || qType === "true_false" ? "col-span-12 md:col-span-8" : "col-span-12 md:col-span-8"}`}>
          <div className="mb-6">
            <span className={`font-heading text-xs font-semibold px-3 py-1 rounded-full ${typeBadge.cls}`}>{typeBadge.label}</span>
            <h2 className="font-heading text-xl md:text-2xl font-semibold mt-3 text-on-surface">{currentQuestion.question}</h2>
          </div>

          {/* MCQ / True-False: radio options */}
          {(qType === "true_false" || qType === "mcq") && (
            <div className={`grid gap-3 ${qType === "true_false" ? "grid-cols-2" : "grid-cols-1"}`}>
              {currentQuestion.options.map((option, index) => (
                <label key={index}
                  className={`group relative flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedAnswer === option
                      ? "border-primary bg-primary-container/10"
                      : "border-surface-variant hover:border-primary-container"
                  }`}>
                  <input type="radio" name="quiz" value={option}
                    checked={selectedAnswer === option}
                    onChange={() => setSelectedAnswer(option)}
                    className="w-5 h-5 text-primary border-outline focus:ring-primary" />
                  <span className={`ml-4 text-base font-body ${selectedAnswer === option ? "text-primary font-semibold" : "text-on-surface group-hover:text-primary"} transition-colors`}>
                    {option}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Fill-in-the-blank */}
          {qType === "fill_blank" && (
            <div className="relative">
              <input
                type="text" value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && hasAnswer) handleSubmit(); }}
                placeholder="Enter your answer..."
                className="w-full bg-surface-container-low border-2 border-outline-variant rounded-xl p-4 focus:border-primary focus:ring-0 transition-all font-body text-base"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Side: Topic + Progress */}
        <div className="col-span-12 md:col-span-4 flex flex-col gap-4">
          {currentQuestion.topic && (
            <div className="glass-card rounded-3xl p-5 border-primary/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>auto_awesome</span>
                <span className="font-heading text-xs font-semibold text-primary">Topic</span>
              </div>
              <p className="text-sm text-on-surface-variant font-body italic">{currentQuestion.topic}</p>
            </div>
          )}
          <div className="glass-card rounded-3xl p-5">
            <h3 className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">Progress</h3>
            <div className="h-2 bg-surface-variant rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-xs text-on-surface-variant mt-2 font-body">{currentIndex + 1} of {totalQuestions} completed</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="col-span-12 flex justify-between items-center mt-4">
          <div></div>
          <button onClick={handleSubmit} disabled={!hasAnswer}
            className={`px-8 py-3 rounded-xl font-heading text-sm font-semibold transition-all active:scale-95 ${
              hasAnswer
                ? "bg-primary text-white shadow-lg hover:shadow-xl"
                : "bg-surface-container text-on-surface-variant cursor-not-allowed"
            }`}>
            {currentIndex === totalQuestions - 1 ? "Complete Quiz" : "Next Question"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizPage;
