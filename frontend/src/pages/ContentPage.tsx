import React from 'react';
import ContentForm from '../components/ContentForm';

const ContentPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest">Content Library</span>
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-on-surface mt-1">Manage Content</h1>
        <p className="text-on-surface-variant font-body mt-2">Add text or upload PDFs to build your learning library. All content is stored securely and available for simplification.</p>
      </div>
      <ContentForm />
    </div>
  );
};

export default ContentPage;
