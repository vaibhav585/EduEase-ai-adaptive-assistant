import React from 'react';
import AuthForm from '../components/AuthForm';

const RegisterPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-surface-bright">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold text-primary mb-1">EduEase</h1>
          <p className="text-sm text-on-surface-variant font-body">AI Learning for Neurodivergent Children</p>
        </div>
        <div className="glass-card rounded-3xl p-8 md:p-10">
          <h2 className="font-heading text-2xl font-bold text-on-surface mb-1">Create your account</h2>
          <p className="text-sm text-on-surface-variant mb-8 font-body">Set up your learning profile in a couple of minutes</p>
          <AuthForm isRegister={true} />
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
