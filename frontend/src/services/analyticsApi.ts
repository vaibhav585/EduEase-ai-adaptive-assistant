const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface RosterStudent {
  uid: string;
  email: string | null;
  disabilities: string[];
  primary: string | null;
  daseScore: number | null;
  coverage: number | null;
  evaluatedAt: unknown;
  sessionsTotal: number;
  sessionsCompleted: number;
}

export interface StudentDetail {
  studentId: string;
  profile: { disabilities: string[]; primary: string | null; severity: string | null };
  latest: {
    score: number | null;
    coverage: number;
    profile: string;
    parameters: Record<string, number>;
    diagnosticOnly: Record<string, number>;
    missingParameters: string[];
    errorBreakdown: {
      counts: Record<string, number>;
      proportions: Record<string, number>;
      meanConfidence: Record<string, number | null>;
      totalWrong: number;
      unclassified: number;
    };
  } | null;
  trend: Array<{ computedAt: unknown; score: number | null; coverage: number }>;
  errorBreakdownCombined: Record<string, number>;
  evaluationCount: number;
}

export interface ClassAggregates {
  totalStudents: number;
  scoredStudents: number;
  classAverageScore: number | null;
  averageByPrimaryDisability: Record<string, number>;
  averageCompletionRate: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function getRoster() {
  return get<{ count: number; students: RosterStudent[] }>('/api/analytics/roster');
}

export function getStudentDetail(studentId: string) {
  return get<StudentDetail>(`/api/analytics/student/${studentId}`);
}

export function getClassAggregates() {
  return get<ClassAggregates>('/api/analytics/class');
}

export async function getRecommendation(studentId: string) {
  const res = await fetch(`${API_URL}/api/analytics/recommendation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId }),
  });
  if (!res.ok) throw new Error(`recommendation failed (${res.status})`);
  return res.json() as Promise<{ recommendation: string; degraded: boolean; cached: boolean }>;
}
