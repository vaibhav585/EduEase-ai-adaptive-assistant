import React from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';

/**
 * Per-student DASE parameter radar (roadmap 5.1).
 *
 * Deliberately plots RAW parameters, not the single composite score — the
 * profile is the point (roadmap §2.4: "profile first, one composite second").
 * A single number on a dashboard invites reading DASE as a grade, which the
 * whole project argues against.
 */

const PARAM_LABELS: Record<string, string> = {
  ACC: 'Accuracy',
  ADJ_ACC: 'Adjusted Acc.',
  COMP: 'Comprehension',
  TIME_EFF: 'Time Efficiency',
  ATT_SPAN: 'Attention Span',
  CONSIST: 'Consistency',
  EFFORT: 'Effort',
  LRN_VEL: 'Learning Velocity',
  TASK_COMP: 'Task Completion',
  READ_FL: 'Reading Fluency',
  VOICE_Q: 'Voice Quality',
  NAV_EFF: 'Nav. Efficiency',
  VIS_ENG: 'Visual Engagement',
  WRIT_EXP: 'Written Expression',
};

interface Props {
  parameters: Record<string, number>;
  diagnosticOnly?: Record<string, number>;
  size?: number;
}

const DASERadarChart: React.FC<Props> = ({ parameters, diagnosticOnly = {}, size = 280 }) => {
  const all = { ...parameters, ...diagnosticOnly };
  const keys = Object.keys(all);

  if (keys.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">
        No parameters measured yet for this student.
      </p>
    );
  }

  const data = keys.map((key) => ({
    parameter: PARAM_LABELS[key] ?? key,
    value: Math.round(all[key] * 100),
    isDiagnostic: key in diagnosticOnly,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={size}>
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="parameter" tick={{ fontSize: 11, fill: '#475569' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickCount={5} />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#4F46E5"
            fill="#4F46E5"
            fillOpacity={0.35}
          />
        </RadarChart>
      </ResponsiveContainer>
      {Object.keys(diagnosticOnly).length > 0 && (
        <p className="text-xs text-slate-500 text-center mt-1">
          Dotted-style dimensions (
          {Object.keys(diagnosticOnly).map((k) => PARAM_LABELS[k] ?? k).join(', ')}) are shown for
          context but are not counted in this student&apos;s score — see the glossary entry on
          diagnostic-only parameters.
        </p>
      )}
    </div>
  );
};

export default DASERadarChart;
