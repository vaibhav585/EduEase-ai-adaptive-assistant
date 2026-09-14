import React from 'react';
import { UserPlus } from 'lucide-react';

import AuthForm from '../components/AuthForm';

const RegisterPage: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-md bg-white/90 backdrop-blur rounded-card shadow-md p-8 border border-slate-100">
        <div className="flex justify-center mb-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-control bg-primary-50 text-primary-600">
            <UserPlus className="h-6 w-6" aria-hidden="true" />
          </span>
        </div>
        <h2 className="text-2xl font-semibold text-primary-800 text-center mb-6">Create your account</h2>
        <AuthForm isRegister={true} />
      </div>
    </div>
  );
};

export default RegisterPage;
