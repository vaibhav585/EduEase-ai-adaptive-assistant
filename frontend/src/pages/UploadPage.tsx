import React from 'react';
import { FileText, Sparkles, Volume2 } from 'lucide-react';

import UploadForm from '../components/UploadForm';
import { useProfile } from '../hooks/useProfile';

/**
 * Where PDF text extraction actually happens (backend/routers/content.py
 * upload_pdf). Previously a small centered 448px card floating alone inside
 * its own `min-h-screen flex items-center justify-center bg-gray-100` — a
 * SECOND full-viewport centering wrapper nested inside Layout's own
 * min-h-screen container, on a mismatched gray background. On any screen
 * wider than the card, most of the page was empty gray space. Rebuilt as a
 * proper two-column page that uses the width Layout already gives it.
 */
const UploadPage: React.FC = () => {
  const { profile } = useProfile();
  const isBlindOrLowVision = profile.disabilities.some((d) => d === 'blind' || d === 'low_vision');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
      <div className="lg:col-span-3">
        <div className="bg-white rounded-card shadow-md p-6 sm:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-control bg-primary-50 text-primary-600">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-800">Upload a lesson</h1>
              <p className="text-sm text-slate-500">Turn a PDF into a simplified lesson and quiz</p>
            </div>
          </div>

          <UploadForm />
        </div>
      </div>

      <aside className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-card shadow-sm p-5 border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            What happens next
          </h2>
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                1
              </span>
              <span>The text is pulled out of your PDF.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                2
              </span>
              <span>It&apos;s rewritten for the way you learn best.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                3
              </span>
              <span>A quiz is built from the same lesson.</span>
            </li>
          </ol>
        </div>

        <div className="bg-primary-50/70 rounded-card p-5 border border-primary-100 flex gap-3">
          <Sparkles className="h-5 w-5 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-primary-900">
            Text is adapted to your accessibility profile — change it any time in{' '}
            <span className="font-semibold">Settings</span>.
          </p>
        </div>

        {isBlindOrLowVision && (
          <div className="bg-success-50/70 rounded-card p-5 border border-success-100 flex gap-3">
            <Volume2 className="h-5 w-5 text-success-700 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-success-900">
              Images in this PDF will get a spoken description
              {!profile.prefs.describeImages && ' — turn this on in Settings'}.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
};

export default UploadPage;
