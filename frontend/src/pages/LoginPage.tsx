import React from 'react';
import AuthForm from '../components/AuthForm';

const LoginPage: React.FC = () => {
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Hero Panel */}
      <div className="hidden md:flex flex-col justify-center px-16 py-12 bg-gradient-to-br from-primary via-primary-container to-[#1e0f7a] text-white relative overflow-hidden">
        <div className="relative z-10 max-w-lg">
          <h1 className="font-heading text-5xl font-bold mb-4 leading-tight">EduEase</h1>
          <p className="text-2xl font-heading font-semibold opacity-95 mb-6">AI Learning Assistant for Neurodivergent Children</p>
          <p className="text-lg opacity-80 leading-relaxed font-body mb-10">
            A secure, adaptive reading workspace powered by Gemini AI, eye-tracking focus detection, and real-time cognitive support.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
              <span className="material-symbols-outlined text-tertiary-fixed mt-0.5" style={{fontVariationSettings: "'FILL' 1"}}>auto_awesome</span>
              <div>
                <p className="font-heading text-sm font-semibold">Adaptive Text Simplification</p>
                <p className="text-xs opacity-70 font-body">Content automatically adjusted to each student's grade level and reading ability.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
              <span className="material-symbols-outlined text-tertiary-fixed mt-0.5" style={{fontVariationSettings: "'FILL' 1"}}>visibility</span>
              <div>
                <p className="font-heading text-sm font-semibold">Eye-Tracking Focus Detection</p>
                <p className="text-xs opacity-70 font-body">WebGazer monitors attention and triggers supportive interventions when needed.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
              <span className="material-symbols-outlined text-tertiary-fixed mt-0.5" style={{fontVariationSettings: "'FILL' 1"}}>monitoring</span>
              <div>
                <p className="font-heading text-sm font-semibold">Teacher Analytics Dashboard</p>
                <p className="text-xs opacity-70 font-body">Real-time quiz scores, focus metrics, and frustration tracking for every student.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[80%] bg-white/5 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-15%] left-[-5%] w-[40%] h-[60%] bg-tertiary-fixed/10 rounded-full blur-[80px]"></div>
      </div>

      {/* Sign-In Panel */}
      <div className="flex flex-col items-center justify-center px-8 py-12 bg-surface-bright">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-8 text-center">
            <h1 className="font-heading text-3xl font-bold text-primary mb-1">EduEase</h1>
            <p className="text-sm text-on-surface-variant font-body">AI Learning for Neurodivergent Children</p>
          </div>
          <div className="glass-card rounded-3xl p-8 md:p-10">
            <h2 className="font-heading text-2xl font-bold text-on-surface mb-1">Welcome back</h2>
            <p className="text-sm text-on-surface-variant mb-8 font-body">Sign in to continue your learning journey</p>
            <AuthForm />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
