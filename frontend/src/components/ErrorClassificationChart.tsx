import React from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

/**
 * Error-cause breakdown pie chart (roadmap 5.2).
 *
 * Confidence is shown per-slice rather than folded into the chart, because a
 * classification's own confidence is part of what it honestly means — hiding it
 * would present a KNOWLEDGE_GAP fallback (often confidence ~0.3, see
 * dase_engine.classify_error) with the same visual certainty as a confident
 * PROCESSING_DELAY call.
 */

const LABELS: Record<string, string> = {
  KNOWLEDGE_GAP: 'Knowledge Gap',
  ATTENTION_LAPSE: 'Attention Lapse',
  PROCESSING_DELAY: 'Processing Delay',
  COMPREHENSION_BARRIER: 'Wording / Comprehension',
};

const COLORS: Record<string, string> = {
  KNOWLEDGE_GAP: '#6366F1',
  ATTENTION_LAPSE: '#F97316',
  PROCESSING_DELAY: '#EAB308',
  COMPREHENSION_BARRIER: '#0EA5E9',
};

interface Props {
  counts: Record<string, number>;
  meanConfidence?: Record<string, number | null>;
  size?: number;
}

const ErrorClassificationChart: React.FC<Props> = ({ counts, meanConfidence = {}, size = 240 }) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">
        No wrong answers recorded yet — nothing to classify.
      </p>
    );
  }

  const data = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({
      label,
      name: LABELS[label] ?? label,
      value: count,
      confidence: meanConfidence[label],
    }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={size}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="75%" label>
            {data.map((entry) => (
              <Cell key={entry.label} fill={COLORS[entry.label] ?? '#94A3B8'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => {
              const num = Number(value) || 0;
              const conf = (item?.payload as { confidence?: number } | undefined)?.confidence;
              return [
                `${num} (${Math.round((num / total) * 100)}%)${
                  conf != null ? ` · avg confidence ${Math.round(conf * 100)}%` : ''
                }`,
                (item?.payload as { name?: string } | undefined)?.name,
              ];
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-500 text-center mt-2">
        Low-confidence classifications (shown in the tooltip) are the system&apos;s honest
        uncertainty — see the glossary on why ambiguous cases are reported, not guessed.
      </p>
    </div>
  );
};

export default ErrorClassificationChart;
