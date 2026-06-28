import React, { useEffect, useState } from "react";
import api from "../services/api";
import Charts from "../components/Charts";

interface Student {
  uid: string;
  email: string;
  grade_level: string | null;
  reading_difficulty: string | null;
}

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

interface Analytics {
  student_id: string;
  quizzes: QuizEntry[];
  sessions: SessionEntry[];
  weak_topics: Record<string, number>;
  total_frustration_triggers: number;
}

const TeacherDashboardPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    api.get("/teacher/students")
      .then((res) => setStudents(res.data.students))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setAnalytics(null); return; }
    setAnalyticsLoading(true);
    api.get(`/teacher/analytics/${selectedId}`)
      .then((res) => setAnalytics(res.data))
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false));
  }, [selectedId]);

  const avgFocus = analytics && analytics.sessions.length > 0
    ? Math.round(analytics.sessions.reduce((a, s) => a + s.average_focus_score, 0) / analytics.sessions.length * 100)
    : null;

  const avgQuiz = analytics && analytics.quizzes.length > 0
    ? Math.round(analytics.quizzes.reduce((a, q) => a + (q.total_questions > 0 ? (q.score / q.total_questions) * 100 : 0), 0) / analytics.quizzes.length)
    : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-indigo-800">Teacher Dashboard</h1>
        <p className="text-slate-600 mt-1">Live student engagement & learning outcomes</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Active Students</p>
          <p className="text-3xl font-semibold text-amber-600 mt-1">{loading ? "—" : students.length}</p>
          <p className="text-xs text-slate-400 mt-2">Enrolled in system</p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Selected Focus</p>
          <p className="text-3xl font-semibold text-emerald-600 mt-1">{avgFocus !== null ? `${avgFocus}%` : "—"}</p>
          <p className="text-xs text-slate-400 mt-2">Avg webcam attention</p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Selected Quiz Avg</p>
          <p className="text-3xl font-semibold text-indigo-600 mt-1">{avgQuiz !== null ? `${avgQuiz}%` : "—"}</p>
          <p className="text-xs text-slate-400 mt-2">Across recorded quizzes</p>
        </div>
      </div>

      {/* Student Roster */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
        <h2 className="text-xl font-semibold text-slate-800 mb-4 text-center">Student Roster</h2>
        {loading ? (
          <p className="text-slate-500 text-center py-4">Loading students...</p>
        ) : students.length === 0 ? (
          <p className="text-slate-500 text-center py-4">No students found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="p-3 text-left">Email</th>
                  <th className="p-3 text-left">Grade</th>
                  <th className="p-3 text-left">Difficulty</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((s) => (
                  <tr
                    key={s.uid}
                    className={`cursor-pointer transition ${selectedId === s.uid ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedId(s.uid)}
                  >
                    <td className="p-3 font-medium">{s.email}</td>
                    <td className="p-3">{s.grade_level ?? "—"}</td>
                    <td className="p-3">{s.reading_difficulty ?? "—"}</td>
                    <td className="p-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedId(s.uid); }}
                        className={`text-xs px-3 py-1 rounded-lg font-semibold ${
                          selectedId === s.uid
                            ? "bg-indigo-600 text-white"
                            : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                        }`}
                      >
                        {selectedId === s.uid ? "Selected" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Analytics Detail */}
      {selectedId && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-800 text-center">
            Analytics: {students.find((s) => s.uid === selectedId)?.email ?? selectedId}
          </h2>
          {analyticsLoading ? (
            <p className="text-slate-500 text-center py-8">Loading analytics...</p>
          ) : analytics ? (
            <>
              <Charts
                quizzes={analytics.quizzes}
                sessions={analytics.sessions}
                weakTopics={analytics.weak_topics}
              />
              {analytics.total_frustration_triggers > 0 && (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-center">
                  <p className="text-amber-800 font-medium">
                    Total frustration triggers recorded: {analytics.total_frustration_triggers}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-500 text-center py-8">No data available for this student.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default TeacherDashboardPage;
