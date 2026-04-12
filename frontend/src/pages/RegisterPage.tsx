import React from 'react';
import AuthForm from '../components/AuthForm';

const RegisterPage: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-md bg-white/90 backdrop-blur rounded-2xl shadow-md p-8 border border-slate-100">
        <h2 className="text-2xl font-semibold text-indigo-800 text-center mb-6">Create your account</h2>
        <AuthForm isRegister={true} />
      </div>
    </div>
  );
};

export default RegisterPage;
