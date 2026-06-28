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

const COLORS = ["#2a14b4", "#4338ca", "#5148d7", "#c3c0ff", "#4edea3", "#6ffbbe", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6"];

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
    { name: "Deep Focus", value: focusBuckets.high },
    { name: "Steady Flow", value: focusBuckets.medium },
    { name: "Needs Support", value: focusBuckets.low },
  ].filter((d) => d.value > 0);
  const pieColors = ["#2a14b4", "#4edea3", "#ba1a1a"];

  const avgQuiz = quizAvgPerStudent.length > 0
    ? Math.round(quizAvgPerStudent.reduce((a, b) => a + b.avg, 0) / quizAvgPerStudent.length) : null;

  const allFocusScores: number[] = [];
  students.forEach((s) => {
    const a = allAnalytics[s.uid];
    (a?.sessions ?? []).forEach((x) => { if (typeof x.average_focus_score === "number") allFocusScores.push(x.average_focus_score); });
  });
  const avgClassFocus = allFocusScores.length > 0
    ? Math.round((allFocusScores.reduce((a, b) => a + b, 0) / allFocusScores.length) * 100)
    : null;

  return (
    <div className="min-h-screen bg-surface-bright animate-fade-in">
      <div className="max-w-[1440px] mx-auto px-4 md:px-12 py-8 space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest">Teacher Dashboard</span>
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-on-surface mt-1">Classroom Overview</h1>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium shadow-sm transition-all active:scale-95">
            <span className="material-symbols-outlined text-[16px]">logout</span>Log Out
          </button>
        </div>

        {/* Hero Banner */}
        <section className="relative overflow-hidden rounded-3xl p-8 md:p-10 bg-primary-container text-white shadow-lg">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2">Welcome back, Professor</h2>
              <p className="text-lg opacity-90 max-w-2xl font-body">
                {students.length > 0 ? `Your classroom has ${students.length} students. ${focusBuckets.high > 0 ? `${focusBuckets.high} are in deep focus.` : ""}` : "Loading your classroom..."}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30 text-center min-w-[130px]">
                <p className="font-heading text-xs font-semibold uppercase tracking-wider opacity-80">Students</p>
                <p className="font-heading text-3xl font-bold">{loading ? "—" : students.length}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30 text-center min-w-[130px]">
                <p className="font-heading text-xs font-semibold uppercase tracking-wider opacity-80">Avg Focus</p>
                <p className="font-heading text-3xl font-bold">{avgClassFocus !== null ? `${avgClassFocus}%` : "—"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Analytical Bento Grid */}
        {!classLoading && students.length > 0 && (
          <section className="bento-grid">
            {/* Focus Distribution Donut */}
            {pieData.length > 0 && (
              <div className="col-span-12 md:col-span-4 glass-card rounded-3xl p-6 flex flex-col items-center">
                <h3 className="w-full font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-4">Focus Distribution</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Quiz Performance Bars */}
            {quizAvgPerStudent.length > 0 && (
              <div className="col-span-12 md:col-span-8 glass-card rounded-3xl p-6">
                <h3 className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-4">Quiz Performance by Student</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={quizAvgPerStudent}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eeff" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Bar dataKey="avg" name="Avg Score %" radius={[8, 8, 0, 0]}>
                      {quizAvgPerStudent.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Session Engagement Timeline */}
            {sessionTimeline.length > 0 && (
              <div className="col-span-12 glass-card rounded-3xl p-6">
                <h3 className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-4">Class Engagement Timeline</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={sessionTimeline}>
                    <defs>
                      <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2a14b4" stopOpacity={0.3}/>
                        <stop offset="100%" stopColor="#2a14b4" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eeff" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="focus" stroke="#2a14b4" name="Focus %" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}

        {/* Student Roster */}
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-white/20 flex justify-between items-center">
            <h3 className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest">Student Roster</h3>
            {!loading && <span className="text-xs text-primary font-bold">{students.length} students</span>}
          </div>
          {loading ? (
            <p className="text-on-surface-variant text-center py-8">Loading students...</p>
          ) : students.length === 0 ? (
            <p className="text-on-surface-variant text-center py-8">No students assigned to you yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-low">
                    <th className="px-6 py-3 text-left font-heading text-xs font-semibold text-on-surface-variant uppercase">Student</th>
                    <th className="px-6 py-3 text-left font-heading text-xs font-semibold text-on-surface-variant uppercase">Grade</th>
                    <th className="px-6 py-3 text-right font-heading text-xs font-semibold text-on-surface-variant uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {students.map((s) => (
                    <tr key={s.uid} className={`hover:bg-white/40 transition-colors cursor-pointer ${selectedId === s.uid ? "bg-primary-fixed/30" : ""}`} onClick={() => setSelectedId(s.uid)}>
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center font-bold text-primary text-sm">
                          {s.email.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-heading text-sm font-semibold text-on-surface">{s.email.split("@")[0]}</p>
                          <p className="text-xs text-on-surface-variant">{s.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface">{s.grade_level ? `Grade ${s.grade_level}` : "—"}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setSelectedId(s.uid); }}
                          className={`font-heading text-xs font-semibold px-4 py-2 rounded-full transition-all ${
                            selectedId === s.uid
                              ? "bg-primary text-on-primary shadow-md"
                              : "text-primary bg-primary/10 hover:bg-primary hover:text-white"
                          }`}>
                          {selectedId === s.uid ? "Selected" : "View Analytics"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Per-student drill-down */}
        {selectedId && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="font-heading text-xl font-semibold text-on-surface text-center">
              Analytics: {students.find((s) => s.uid === selectedId)?.email ?? selectedId}
            </h2>
            {analyticsLoading ? (
              <p className="text-on-surface-variant text-center py-8">Loading analytics...</p>
            ) : analytics ? (
              <>
                <Charts quizzes={analytics.quizzes} sessions={analytics.sessions} weakTopics={analytics.weak_topics} />
                {analytics.total_frustration_triggers > 0 && (
                  <div className="glass-card rounded-2xl p-5 border-l-4 border-error flex gap-3 items-start">
                    <span className="material-symbols-outlined text-error">warning</span>
                    <div>
                      <p className="font-heading text-sm font-semibold text-on-surface">Frustration Alert</p>
                      <p className="text-xs text-on-surface-variant">{analytics.total_frustration_triggers} frustration triggers recorded. Consider a personalized intervention.</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-on-surface-variant text-center py-8">No data available for this student.</p>
            )}
          </div>
        )}
      </div>

      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] bg-primary/5 rounded-full blur-[120px] motion-safe:animate-pulse"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[30%] h-[50%] bg-surface-variant/40 rounded-full blur-[120px]"></div>
      </div>
    </div>
  );
};

export default TeacherDashboardPage;
