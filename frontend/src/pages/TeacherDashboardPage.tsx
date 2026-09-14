import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CheckCircle2,
  Download,
  Lightbulb,
  Target,
  UserX,
  Users,
} from 'lucide-react';

import DASERadarChart from '../components/DASERadarChart';
import ErrorClassificationChart from '../components/ErrorClassificationChart';
import {
  ClassAggregates,
  getClassAggregates,
  getRecommendation,
  getRoster,
  getStudentDetail,
  RosterStudent,
  StudentDetail,
} from '../services/analyticsApi';
import { DISABILITY_LABELS } from '../types/profile';

/**
 * Replaces the Phase-0 mock array with real DASE data (roadmap Phase 4).
 *
 * Every score on this page can be `null` — no quiz taken yet, or Firestore
 * unreachable — and null is rendered as "No data" rather than 0, because 0
 * would misrepresent an unscored student as a failing one.
 */

function pct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function scoreColor(value: number | null): string {
  if (value == null) return 'text-slate-400';
  if (value >= 0.75) return 'text-success-600';
  if (value >= 0.5) return 'text-warning-600';
  return 'text-danger-600';
}

function exportCsv(students: RosterStudent[]) {
  const header = [
    'email',
    'primary_disability',
    'dase_score',
    'coverage',
    'sessions_completed',
    'sessions_total',
  ];
  const rows = students.map((s) => [
    s.email ?? '',
    s.primary ?? 'none',
    s.daseScore != null ? s.daseScore.toFixed(3) : '',
    s.coverage != null ? s.coverage.toFixed(3) : '',
    String(s.sessionsCompleted),
    String(s.sessionsTotal),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eduease-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TeacherDashboardPage: React.FC = () => {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [classStats, setClassStats] = useState<ClassAggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  useEffect(() => {
    Promise.all([getRoster(), getClassAggregates()])
      .then(([roster, stats]) => {
        setStudents(roster.students);
        setClassStats(stats);
        if (roster.students.length) setSelectedId(roster.students[0].uid);
      })
      .catch((err) => {
        console.error('Failed to load roster:', err);
        setLoadError(
          'Could not load class data. The backend may be unreachable, or Firestore may not be configured.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setDetail(null);
    setRecommendation(null);
    setDetailLoading(true);
    getStudentDetail(selectedId)
      .then(setDetail)
      .catch((err) => console.error('Failed to load student detail:', err))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const handleRecommend = async () => {
    if (!selectedId) return;
    setRecLoading(true);
    try {
      const { recommendation: text } = await getRecommendation(selectedId);
      setRecommendation(text);
    } catch (err) {
      console.error('Recommendation failed:', err);
      setRecommendation('Could not generate a recommendation right now.');
    } finally {
      setRecLoading(false);
    }
  };

  const selectedStudent = useMemo(
    () => students.find((s) => s.uid === selectedId) ?? null,
    [students, selectedId],
  );

  const trendData = useMemo(
    () =>
      (detail?.trend ?? []).map((t, i) => ({
        name: `#${i + 1}`,
        score: t.score != null ? Math.round(t.score * 100) : null,
      })),
    [detail],
  );

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-slate-600" role="status">
        Loading class data…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl bg-white rounded-card shadow-md p-8 border border-slate-100 text-center">
        <p className="text-slate-700">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-semibold text-primary-800">Teacher Dashboard</h1>
          <p className="text-slate-600 mt-1">
            Disability-adaptive learning profiles — a support signal, not a grade.
          </p>
        </div>
        <button
          onClick={() => exportCsv(students)}
          disabled={!students.length}
          className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2.5 rounded-control min-h-[44px] disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {students.length === 0 && (
        <div className="bg-white rounded-card shadow-md p-10 border border-slate-100 text-center">
          <UserX className="h-10 w-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-600 font-medium">No students have registered yet.</p>
          <p className="text-slate-400 text-sm mt-1">
            Once students sign up and complete a lesson, their profiles will appear here.
          </p>
        </div>
      )}

      {students.length > 0 && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-card bg-white shadow-md p-5 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-500">
                <Target className="h-4 w-4" aria-hidden="true" />
                <p className="text-sm">Class Average DASE Score</p>
              </div>
              <p className={`text-3xl font-semibold mt-1 ${scoreColor(classStats?.classAverageScore ?? null)}`}>
                {pct(classStats?.classAverageScore ?? null)}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                {classStats?.scoredStudents ?? 0} of {classStats?.totalStudents ?? 0} students scored
              </p>
            </div>
            <div className="rounded-card bg-white shadow-md p-5 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-500">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <p className="text-sm">Average Completion Rate</p>
              </div>
              <p className="text-3xl font-semibold text-primary-600 mt-1">
                {pct(classStats?.averageCompletionRate ?? null)}
              </p>
              <p className="text-xs text-slate-400 mt-2">Sessions finished vs. started</p>
            </div>
            <div className="rounded-card bg-white shadow-md p-5 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-500">
                <Users className="h-4 w-4" aria-hidden="true" />
                <p className="text-sm">Total Students</p>
              </div>
              <p className="text-3xl font-semibold text-warning-600 mt-1">{students.length}</p>
              <p className="text-xs text-slate-400 mt-2">Registered in this class</p>
            </div>
          </div>

          {/* By-disability breakdown */}
          {classStats && Object.keys(classStats.averageByPrimaryDisability).length > 0 && (
            <div className="bg-white rounded-card shadow-md p-6 border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800 mb-3 text-center">
                Average DASE Score by Primary Disability Profile
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={Object.entries(classStats.averageByPrimaryDisability).map(([k, v]) => ({
                    name: DISABILITY_LABELS[k as keyof typeof DISABILITY_LABELS] ?? k,
                    score: Math.round(v * 100),
                  }))}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${Number(v) || 0}%`} />
                  <Bar dataKey="score" fill="#4F46E5" name="Avg DASE Score" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-500 text-center mt-2">
                Each profile is scored on ITS OWN weighting — bars are not directly comparable as a
                ranking of who is &quot;doing better&quot;. See the glossary on ablation spread.
              </p>
            </div>
          )}

          {/* Roster table */}
          <div className="bg-white rounded-card shadow-md p-6 border border-slate-100">
            <h2 className="text-xl font-semibold text-slate-800 mb-4 text-center">
              Student Progress Overview
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="p-3 text-left">Student</th>
                    <th className="p-3 text-left">Profile</th>
                    <th className="p-3 text-left">DASE Score</th>
                    <th className="p-3 text-left">Coverage</th>
                    <th className="p-3 text-left">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {students.map((s) => (
                    <tr
                      key={s.uid}
                      onClick={() => setSelectedId(s.uid)}
                      className={`cursor-pointer hover:bg-slate-50 ${
                        s.uid === selectedId ? 'bg-primary-50' : ''
                      }`}
                    >
                      <td className="p-3 font-medium">{s.email ?? s.uid}</td>
                      <td className="p-3 text-slate-700">
                        {s.primary ? DISABILITY_LABELS[s.primary as keyof typeof DISABILITY_LABELS] ?? s.primary : '—'}
                      </td>
                      <td className={`p-3 font-semibold ${scoreColor(s.daseScore)}`}>{pct(s.daseScore)}</td>
                      <td className="p-3 text-slate-600">{pct(s.coverage)}</td>
                      <td className="p-3 text-slate-600">
                        {s.sessionsCompleted}/{s.sessionsTotal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected student deep-dive */}
          {selectedStudent && (
            <div className="bg-white rounded-card shadow-md p-6 border border-slate-100">
              <h2 className="text-xl font-semibold text-primary-800 mb-1 text-center">
                {selectedStudent.email ?? selectedStudent.uid}
              </h2>
              <p className="text-sm text-slate-500 text-center mb-6">
                {selectedStudent.disabilities.length
                  ? selectedStudent.disabilities
                      .map((d) => DISABILITY_LABELS[d as keyof typeof DISABILITY_LABELS] ?? d)
                      .join(', ')
                  : 'No disability declared'}
              </p>

              {detailLoading && <p className="text-center text-slate-500">Loading profile…</p>}

              {!detailLoading && !detail?.latest && (
                <p className="text-center text-slate-500">
                  No quiz completed yet — DASE needs at least one scored session.
                </p>
              )}

              {!detailLoading && detail?.latest && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 text-center">
                      Learning Profile (all dimensions, not just accuracy)
                    </h3>
                    <DASERadarChart
                      parameters={detail.latest.parameters}
                      diagnosticOnly={detail.latest.diagnosticOnly}
                    />
                    <p className="text-xs text-slate-500 text-center mt-1">
                      Coverage: {pct(detail.latest.coverage)} of this profile&apos;s intended
                      parameters were measurable.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 text-center">
                      Why wrong answers happened
                    </h3>
                    <ErrorClassificationChart
                      counts={detail.errorBreakdownCombined}
                      meanConfidence={detail.latest.errorBreakdown.meanConfidence}
                    />
                  </div>

                  {trendData.length > 1 && (
                    <div className="lg:col-span-2">
                      <h3 className="text-sm font-semibold text-slate-700 mb-2 text-center">
                        Score Trend Over Time
                      </h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} />
                          <Tooltip formatter={(v) => `${Number(v) || 0}%`} />
                          <Legend />
                          <Line type="monotone" dataKey="score" stroke="#4F46E5" name="DASE Score" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="lg:col-span-2 rounded-xl border border-primary-100 bg-primary-50/60 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Lightbulb className="h-4 w-4 text-primary-600" aria-hidden="true" />
                        AI Teaching Suggestions
                      </h3>
                      <button
                        onClick={handleRecommend}
                        disabled={recLoading}
                        className="text-xs bg-primary-600 hover:bg-primary-700 text-white font-semibold px-3 py-2 rounded-control disabled:opacity-50 min-h-[36px]"
                      >
                        {recLoading ? 'Generating…' : recommendation ? 'Regenerate' : 'Generate'}
                      </button>
                    </div>
                    {recommendation ? (
                      <p className="text-sm text-slate-700 whitespace-pre-line">{recommendation}</p>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Generate AI-suggested next steps grounded in this student&apos;s actual data.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherDashboardPage;
