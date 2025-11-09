import React from 'react';

const TeacherDashboardPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center mb-6">Teacher Dashboard</h2>
        <p className="text-center text-gray-600">Welcome, Teacher! This is your dashboard.</p>
        {/* Future: Display student progress here */}
      </div>
    </div>
  );
};

export default TeacherDashboardPage;
