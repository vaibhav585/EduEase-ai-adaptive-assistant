import React from 'react';
import { FolderOpen } from 'lucide-react';

import ContentForm from '../components/ContentForm';

/**
 * Same nested min-h-screen/bg-gray-100 whitespace bug as the old UploadPage —
 * fixed the same way: use the width Layout already gives the page instead of
 * re-centering a small card inside it.
 */
const ContentPage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-card shadow-md p-6 sm:p-8 border border-slate-100">
        <div className="flex items-center gap-3 mb-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-control bg-primary-50 text-primary-600">
            <FolderOpen className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-800">Manage content</h1>
            <p className="text-sm text-slate-500">Add and organize your learning material</p>
          </div>
        </div>

        <ContentForm />
      </div>
    </div>
  );
};

export default ContentPage;
