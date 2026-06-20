
import React from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';

const Quiz: React.FC = () => {
  const location = useLocation();
  const { text } = location.state || { text: '' };
  const [questions, setQuestions] = React.useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [showScore, setShowScore] = React.useState(false);
  const [loading, setLoading] = React.useState(true); // New loading state
  const [error, setError] = React.useState<string | null>(null); // New error state

  React.useEffect(() => {
    if (text) {
      axios.post('http://localhost:8000/generate-quiz/', { text })
        .then(response => {
          setQuestions(response.data.questions);
          setLoading(false); // Set loading to false after fetching
        })
        .catch(error => {
          console.error('Error generating quiz:', error);
          setError('Failed to generate quiz. Please try again.'); // Set error message
          setLoading(false); // Set loading to false on error
        });
    } else {
      setError('No text provided to generate quiz.'); // Handle case where no text is passed
      setLoading(false);
    }
  }, [text]);

  const handleAnswer = (answer: string) => {
    if (answer === questions[currentQuestion].answer) {
      setScore(score + 1);
    }
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowScore(true);
    }
  };

  if (loading) {
    return <div>Loading quiz...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (questions.length === 0) {
    return <div>No questions generated for this text.</div>;
  }

  return (
    <div>
      {showScore ? (
        <div>
          <h3 className="text-lg font-bold mb-2">Your score: {score}/{questions.length}</h3>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-bold mb-2">{questions[currentQuestion]?.question}</h3>
          <div>
            {questions[currentQuestion]?.options.map((option: string) => (
              <button
                key={option}
                onClick={() => handleAnswer(option)}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mr-2"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Quiz;
