import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import mermaid from 'mermaid';

import { notify } from '../services/notify';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface Concept {
  title: string;
  explanation: string;
  emoji: string;
}

interface VisualSummaryData {
  diagram: string | null;
  diagramType: string | null;
  concepts: Concept[];
  degraded: boolean;
}

let mermaidInitialized = false;
function ensureMermaidInit() {
  if (mermaidInitialized) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
  mermaidInitialized = true;
}

/**
 * On-demand visual summary for deaf-first learning (roadmap 5.2).
 *
 * Fires ONLY when the student clicks the button — never automatically on
 * lesson load. This is the one call in the content pipeline that isn't
 * already free after a lesson's first view (see visual_generator.py), so
 * costing it only when actually wanted matters more here than anywhere else
 * in the app.
 */
interface Props {
  text: string;
  profile: string;
}

const VisualSummary: React.FC<Props> = ({ text, profile }) => {
  const [data, setData] = useState<VisualSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const renderIdRef = useRef(0);

  const fetchSummary = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data: result } = await axios.post<VisualSummaryData>(`${API_URL}/api/visual-summary/`, {
        text,
        profile,
      });
      setData(result);
      if (result.degraded) {
        notify('Visual summary is unavailable right now. Showing text only.', { kind: 'error' });
      }
    } catch (err) {
      console.error('Visual summary failed:', err);
      setError('Could not generate a visual summary right now.');
    } finally {
      setLoading(false);
    }
  }, [text, profile]);

  useEffect(() => {
    if (!data?.diagram) {
      setSvg(null);
      return;
    }
    ensureMermaidInit();
    const id = `visual-summary-${++renderIdRef.current}`;
    let cancelled = false;

    mermaid
      .render(id, data.diagram)
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((err) => {
        // A malformed diagram must not take the concept cards down with it —
        // visual_generator.py already sanitizes the common cases, but a render
        // failure here still degrades to cards-only rather than a blank panel.
        console.warn('Mermaid render failed:', err);
        if (!cancelled) setSvg(null);
      });

    return () => {
      cancelled = true;
    };
  }, [data?.diagram]);

  if (!data && !loading) {
    return (
      <button
        type="button"
        onClick={() => void fetchSummary()}
        className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 px-5 rounded-lg min-h-[44px]"
      >
        Show visual summary
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Visual Summary</h2>
        {data && (
          <button
            type="button"
            onClick={() => void fetchSummary()}
            disabled={loading}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-2 rounded-lg disabled:opacity-50 min-h-[36px]"
          >
            {loading ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </div>

      {loading && !data && (
        <p className="text-slate-500 text-center py-8" role="status">
          Building your visual summary…
        </p>
      )}

      {error && <p className="text-danger-600 text-sm text-center py-4">{error}</p>}

      {data && (
        <>
          {svg && (
            <div
              className="overflow-x-auto mb-6 flex justify-center"
              // Mermaid's own output — rendered with securityLevel: 'strict' above,
              // which sanitizes the SVG it produces.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}

          {!svg && !data.diagram && (
            <p className="text-slate-500 text-sm text-center mb-4">
              This lesson didn&apos;t have a clear sequence to diagram — here are the key ideas
              instead.
            </p>
          )}

          {data.concepts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.concepts.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 flex gap-3 items-start"
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {c.emoji}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{c.title}</p>
                    <p className="text-slate-600 text-sm">{c.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.concepts.length === 0 && !data.diagram && !error && (
            <p className="text-slate-500 text-center py-4">No visual summary available.</p>
          )}
        </>
      )}
    </div>
  );
};

export default VisualSummary;
