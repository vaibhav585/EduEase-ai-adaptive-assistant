
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage'; // This will become StudentDashboardPage
import TeacherDashboardPage from './pages/TeacherDashboardPage'; // New import
import UploadPage from './pages/UploadPage';
import LearningPage from './pages/LearningPage';
import ContentPage from './pages/ContentPage';
import RoleGate from './components/RoleGate';

import QuizPage from './pages/QuizPage';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<LoginPage />} /> {/* Default route to login */}

        {/* Protected routes */}
        <Route
          path="/student-dashboard"
          element={
            <RoleGate expectedRole="student">
              <DashboardPage />
            </RoleGate>
          }
        />
        <Route
          path="/teacher-dashboard"
          element={
            <RoleGate expectedRole="teacher">
              <TeacherDashboardPage />
            </RoleGate>
          }
        />
        <Route
          path="/upload"
          element={
            <RoleGate expectedRole="student"> {/* Assuming upload is for students */}
              <UploadPage />
            </RoleGate>
          }
        />
        <Route
          path="/learning"
          element={
            <RoleGate expectedRole="student"> {/* Assuming learning is for students */}
              <LearningPage />
            </RoleGate>
          }
        />
        <Route
          path="/content"
          element={
            <RoleGate expectedRole="student"> {/* Assuming content is for students */}
              <ContentPage />
            </RoleGate>
          }
        />
        <Route
          path="/quiz"
          element={
            <RoleGate expectedRole="student"> {/* Assuming quiz is for students */}
              <QuizPage />
            </RoleGate>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;
