import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";

interface Question {
  question: string;
  options: string[];
  answer: string;
  topic?: string;
}

const QuizPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { text } = location.state || { text: "" };

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  const [wrongTopics, setWrongTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const TOTAL_QUESTIONS = 10;

  useEffect(() => {
    if (text) {
      api
        .post("/generate-quiz/", { text })
        .then((res) => {
          const data = res.data.questions.slice(0, TOTAL_QUESTIONS);
          setQuestions(data);
        })
        .catch((err) => console.error("Error fetching quiz:", err))
        .finally(() => setLoading(false));
    }
  }, [text]);

  const handleSubmit = () => {
    if (!selectedAnswer) return;

    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedAnswer === currentQuestion.answer;

    if (isCorrect) setScore((prev) => prev + 1);
    else if (currentQuestion.topic) setWrongTopics((prev) => [...prev, currentQuestion.topic]);

    if (currentIndex < TOTAL_QUESTIONS - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
    } else {
      setIsQuizCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setWrongTopics([]);
    setIsQuizCompleted(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-lg text-slate-600">
        Loading quiz...
      </div>
    );
  }

  if (isQuizCompleted) {
    const uniqueWeakAreas = [...new Set(wrongTopics)];
    return (
      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-md p-8 border border-slate-100">
        <h2 className="text-3xl font-semibold text-indigo-800 mb-2 text-center">🎉 Quiz Completed!</h2>
        <p className="text-lg text-slate-700 text-center mb-6">
          Your Score: <b>{score}/{TOTAL_QUESTIONS}</b>
        </p>

        {uniqueWeakAreas.length > 0 ? (
          <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">🧩 Focus Areas to Improve</h3>
            <ul className="list-disc ml-6 text-slate-700">
              {uniqueWeakAreas.map((topic, i) => <li key={i}>{topic}</li>)}
            </ul>
          </div>
        ) : (
          <p className="text-emerald-600 text-lg font-medium text-center">
            Great job! No major weak areas detected.
          </p>
        )}

        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={handleRestart}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold"
          >
            Retry Quiz
          </button>
          <button
            onClick={() => navigate("/student-dashboard")}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = Math.round(((currentIndex + 1) / TOTAL_QUESTIONS) * 100);

  return (
    <div className="mx-auto max-w-3xl bg-white rounded-2xl shadow-md p-8 border border-slate-100">
      <h2 className="text-2xl font-semibold text-indigo-800 mb-1 text-center">🧠 Quiz Time!</h2>
      <p className="text-slate-600 text-center mb-4">
        Question {currentIndex + 1} of {TOTAL_QUESTIONS}
      </p>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden mb-6">
        <div
          className="h-2 bg-indigo-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <h3 className="text-xl font-semibold mb-5 text-center text-slate-800">
        {currentQuestion?.question}
      </h3>

      <div className="flex flex-col gap-3">
        {currentQuestion?.options.map((option, index) => (
          <label
            key={index}
            className={`p-3 border rounded-xl cursor-pointer transition
              ${selectedAnswer === option ? "bg-indigo-50 border-indigo-300" : "hover:bg-slate-50 border-slate-200"}`}
          >
            <input
              type="radio"
              name="quiz"
              value={option}
              checked={selectedAnswer === option}
              onChange={() => setSelectedAnswer(option)}
              className="mr-2"
            />
            {option}
          </label>
        ))}
      </div>

      <div className="flex justify-center mt-6">
        <button
          onClick={handleSubmit}
          disabled={!selectedAnswer}
          className={`px-6 py-2 font-semibold rounded-lg
            ${selectedAnswer ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-slate-300 text-slate-600 cursor-not-allowed"}`}
        >
          {currentIndex === TOTAL_QUESTIONS - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
};

export default QuizPage;
