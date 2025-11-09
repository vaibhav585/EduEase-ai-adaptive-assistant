
import React from 'react';
import AuthForm from '../components/AuthForm';

const LoginPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center mb-6">Login</h2>
        <AuthForm isRegister={false} />
      </div>
    </div>
  );
};

export default LoginPage;
