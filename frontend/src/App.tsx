import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TeacherDashboardPage from './pages/TeacherDashboardPage';
import UploadPage from './pages/UploadPage';
import LearningPage from './pages/LearningPage';
import ContentPage from './pages/ContentPage';
import RoleGate from './components/RoleGate';
import QuizPage from './pages/QuizPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/Layout';
import VoiceNavigator from './components/VoiceNavigator';
import AccessibleNotification from './components/AccessibleNotification';

const App: React.FC = () => {
  return (
    <Router>
      {/* Inside Router: it uses useNavigate/useLocation */}
      <VoiceNavigator />
      {/* Renders every notify() call according to the viewer's profile — the
          visual/vibration twin of VoiceNavigator's audio-only state cues. */}
      <AccessibleNotification />
      <Layout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<LoginPage />} />

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
              <RoleGate expectedRole="student">
                <UploadPage />
              </RoleGate>
            }
          />
          <Route
            path="/learning"
            element={
              <RoleGate expectedRole="student">
                <LearningPage />
              </RoleGate>
            }
          />
          <Route
            path="/content"
            element={
              <RoleGate expectedRole="student">
                <ContentPage />
              </RoleGate>
            }
          />
          <Route
            path="/quiz"
            element={
              <RoleGate expectedRole="student">
                <QuizPage />
              </RoleGate>
            }
          />
          <Route
            path="/settings"
            element={
              <RoleGate expectedRole="student">
                <SettingsPage />
              </RoleGate>
            }
          />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
