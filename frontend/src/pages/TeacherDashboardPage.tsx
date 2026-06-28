import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import api from "../services/api";
import Charts from "../components/Charts";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
  ResponsiveContainer,
} from "recharts";

interface Student { uid: string; email: string; grade_level: string | null; }

interface QuizEntry { score: number; total_questions: number; wrong_topics: string[]; timestamp: string; }
interface SessionEntry { session_id: string; average_focus_score: number; frustration_triggers: number; timestamp: string; }
interface Analytics {
  student_id: string;
  quizzes: QuizEntry[];
  sessions: SessionEntry[];
  weak_topics: Record<string, number>;
  total_frustration_triggers: number;
}

const COLORS = ["#4F46E5", "#22C55E", "#F97316", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F59E0B", "#6366F1", "#10B981"];

const TeacherDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [allAnalytics, setAllAnalytics] = useState<Record<string, Analytics>>({});
  const [classLoading, setClassLoading] = useState(false);

  useEffect(() => {
    api.get("/teacher/students")
      .then((res) => setStudents(res.data.students))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (students.length === 0) return;
    setClassLoading(true);
    Promise.all(
      students.map((s) =>
        api.get(`/teacher/analytics/${s.uid}`)
          .then((res) => ({ uid: s.uid, data: res.data as Analytics }))
          .catch(() => null)
      )
    ).then((results) => {
      const map: Record<string, Analytics> = {};
      results.forEach((r) => { if (r) map[r.uid] = r.data; });
      setAllAnalytics(map);
    }).finally(() => setClassLoading(false));
  }, [students]);

  useEffect(() => {
    if (!selectedId) { setAnalytics(null); return; }
    if (allAnalytics[selectedId]) { setAnalytics(allAnalytics[selectedId]); return; }
    setAnalyticsLoading(true);
    api.get(`/teacher/analytics/${selectedId}`)
      .then((res) => setAnalytics(res.data))
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false));
  }, [selectedId, allAnalytics]);

  const handleLogout = async () => { await signOut(auth); navigate("/login"); };

  // Classroom aggregate data
  const focusBuckets = { high: 0, medium: 0, low: 0 };
  const quizAvgPerStudent: { name: string; avg: number }[] = [];
  const sessionTimeline: { label: string; focus: number; frustrations: number }[] = [];

  students.forEach((s) => {
    const a = allAnalytics[s.uid];
    if (!a) return;
    const label = s.email.split("@")[0];
    const sess = a.sessions ?? [];
    const quiz = a.quizzes ?? [];
    if (sess.length > 0) {
      const avgF = sess.reduce((acc, x) => acc + (x.average_focus_score ?? 0), 0) / sess.length;
      if (avgF >= 0.75) focusBuckets.high++;
      else if (avgF >= 0.5) focusBuckets.medium++;
      else focusBuckets.low++;
    }
    if (quiz.length > 0) {
      const avg = Math.round(
        quiz.reduce((acc, q) => acc + ((q.total_questions ?? 0) > 0 ? ((q.score ?? 0) / q.total_questions) * 100 : 0), 0) / quiz.length
      );
      quizAvgPerStudent.push({ name: label, avg });
    }
  });

  const allSessions = students.flatMap((s) => {
    const a = allAnalytics[s.uid];
    const sess = a?.sessions ?? [];
    return sess.map((x) => ({ ...x, student: s.email.split("@")[0] }));
  });
  allSessions.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
  allSessions.slice(-15).forEach((s, i) => {
    sessionTimeline.push({
      label: `${s.student} #${i + 1}`,
      focus: Math.round((s.average_focus_score ?? 0) * 100),
      frustrations: s.frustration_triggers ?? 0,
    });
  });

  const pieData = [
    { name: "High Focus", value: focusBuckets.high },
    { name: "Medium Focus", value: focusBuckets.medium },
    { name: "Low Focus", value: focusBuckets.low },
  ].filter((d) => d.value > 0);
  const pieColors = ["#22C55E", "#F59E0B", "#EF4444"];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-indigo-800">Teacher Dashboard</h1>
          <p className="text-slate-600 mt-1">Live student engagement & learning outcomes</p>
        </div>
        <button onClick={handleLogout}
          className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold shadow">
          Log Out
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">My Students</p>
          <p className="text-3xl font-semibold text-amber-600 mt-1">{loading ? "—" : students.length}</p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Avg Quiz Score</p>
          <p className="text-3xl font-semibold text-indigo-600 mt-1">
            {quizAvgPerStudent.length > 0 ? `${Math.round(quizAvgPerStudent.reduce((a, b) => a + b.avg, 0) / quizAvgPerStudent.length)}%` : "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">High Focus Rate</p>
          <p className="text-3xl font-semibold text-emerald-600 mt-1">
            {students.length > 0 && !classLoading ? `${Math.round((focusBuckets.high / Math.max(focusBuckets.high + focusBuckets.medium + focusBuckets.low, 1)) * 100)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Classroom Charts */}
      {!classLoading && students.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {pieData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100">
              <h3 className="text-md font-semibold text-slate-800 mb-3 text-center">Focus Distribution</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} label dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {quizAvgPerStudent.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100">
              <h3 className="text-md font-semibold text-slate-800 mb-3 text-center">Quiz Avg by Student</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={quizAvgPerStudent}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip />
                  <Bar dataKey="avg" name="Avg Score %" radius={[6, 6, 0, 0]}>
                    {quizAvgPerStudent.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {sessionTimeline.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100">
              <h3 className="text-md font-semibold text-slate-800 mb-3 text-center">Recent Session Engagement</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={sessionTimeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="focus" stroke="#22C55E" name="Focus %" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Student Roster */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
        <h2 className="text-xl font-semibold text-slate-800 mb-4 text-center">Student Roster</h2>
        {loading ? (
          <p className="text-slate-500 text-center py-4">Loading students...</p>
        ) : students.length === 0 ? (
          <p className="text-slate-500 text-center py-4">No students assigned to you yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="p-3 text-left">Email</th>
                  <th className="p-3 text-left">Grade</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((s) => (
                  <tr key={s.uid}
                    className={`cursor-pointer transition ${selectedId === s.uid ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedId(s.uid)}>
                    <td className="p-3 font-medium">{s.email}</td>
                    <td className="p-3">{s.grade_level ?? "—"}</td>
                    <td className="p-3">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedId(s.uid); }}
                        className={`text-xs px-3 py-1 rounded-lg font-semibold ${
                          selectedId === s.uid ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                        }`}>
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

      {/* Per-student analytics */}
      {selectedId && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-800 text-center">
            Analytics: {students.find((s) => s.uid === selectedId)?.email ?? selectedId}
          </h2>
          {analyticsLoading ? (
            <p className="text-slate-500 text-center py-8">Loading analytics...</p>
          ) : analytics ? (
            <>
              <Charts quizzes={analytics.quizzes} sessions={analytics.sessions} weakTopics={analytics.weak_topics} />
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
