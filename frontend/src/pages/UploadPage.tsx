import React from 'react';
import UploadForm from '../components/UploadForm';

const UploadPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest">Content Ingestion</span>
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-on-surface mt-1">Upload a Document</h1>
        <p className="text-on-surface-variant font-body mt-2">Upload a PDF to generate simplified reading material, interactive quizzes, and AI-powered learning sessions.</p>
      </div>
      <div className="glass-card rounded-3xl p-8">
        <UploadForm />
      </div>
    </div>
  );
};

export default UploadPage;
