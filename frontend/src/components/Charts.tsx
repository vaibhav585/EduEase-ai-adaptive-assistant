import React from "react";
import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

interface QuizEntry {
  score: number;
  total_questions: number;
  wrong_topics: string[];
  timestamp: string;
}

interface SessionEntry {
  session_id: string;
  average_focus_score: number;
  frustration_triggers: number;
  timestamp: string;
}

interface ChartsProps {
  quizzes: QuizEntry[];
  sessions: SessionEntry[];
  weakTopics: Record<string, number>;
}

const Charts: React.FC<ChartsProps> = ({ quizzes, sessions, weakTopics }) => {
  const quizData = quizzes.map((q, i) => ({
    label: `Q${i + 1}`,
    pct: q.total_questions > 0 ? Math.round((q.score / q.total_questions) * 100) : 0,
  }));

  const focusData = sessions.map((s, i) => ({
    label: `S${i + 1}`,
    focus: Math.round(s.average_focus_score * 100),
    frustrations: s.frustration_triggers,
  }));

  const topicData = Object.entries(weakTopics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => ({ topic, count }));

  if (quizzes.length === 0 && sessions.length === 0) {
    return <p className="text-slate-500 text-center py-8">No analytics data recorded yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {quizData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100">
          <h3 className="text-md font-semibold text-slate-800 mb-3 text-center">Quiz Accuracy Over Time</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={quizData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pct" stroke="#4F46E5" name="Score %" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {focusData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100">
          <h3 className="text-md font-semibold text-slate-800 mb-3 text-center">Focus & Frustration Timeline</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={focusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis yAxisId="left" domain={[0, 100]} unit="%" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="focus" stroke="#22C55E" name="Focus %" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="frustrations" stroke="#F97316" name="Frustrations" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {topicData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100 lg:col-span-2">
          <h3 className="text-md font-semibold text-slate-800 mb-3 text-center">Most Missed Topics</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topicData} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="topic" width={80} />
              <Tooltip />
              <Bar dataKey="count" fill="#EF4444" name="Times Missed" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default Charts;
