
import React from 'react';
import ContentForm from '../components/ContentForm';

const ContentPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center mb-6">Manage Content</h2>
        <ContentForm />
      </div>
    </div>
  );
};

export default ContentPage;
