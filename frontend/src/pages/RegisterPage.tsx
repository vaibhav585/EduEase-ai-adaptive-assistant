
import React from 'react';
import AuthForm from '../components/AuthForm';

const RegisterPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center mb-6">Register</h2>
        <AuthForm isRegister={true} />
      </div>
    </div>
  );
};

export default RegisterPage;
