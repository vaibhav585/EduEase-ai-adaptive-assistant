import React from 'react';
import { useSignOut } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';
import Chatbot from '../components/Chatbot';
import { useTranslation } from 'react-i18next';

const DashboardPage: React.FC = () => {
  const [signOut] = useSignOut(auth);
  const navigate = useNavigate();
  const [showChatbot, setShowChatbot] = React.useState(false);
  const { t, i18n } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const changeLanguage = (lng: string) => i18n.changeLanguage(lng);

  return (
    <div className="space-y-8">
      {/* Top Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-indigo-800">{t('Student Dashboard')}</h1>
          <p className="text-slate-600">{t('Welcome to your dashboard!')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border border-slate-200 rounded-xl p-1">
            <button onClick={() => changeLanguage('en')} className="px-3 py-1 text-sm hover:text-indigo-700">EN</button>
            <button onClick={() => changeLanguage('hi')} className="px-3 py-1 text-sm hover:text-indigo-700">HI</button>
            <button onClick={() => changeLanguage('ta')} className="px-3 py-1 text-sm hover:text-indigo-700">TA</button>
          </div>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold shadow"
          >
            {t('Sign Out')}
          </button>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Link
          to="/upload"
          className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold text-slate-800">{t('Upload a PDF to get started')}</h3>
          <p className="text-slate-600 mt-1">{t('Generate simplified content & quizzes')}</p>
        </Link>
        <Link
          to="/content"
          className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold text-slate-800">{t('Manage Content')}</h3>
          <p className="text-slate-600 mt-1">{t('View and organize learning material')}</p>
        </Link>
        <Link
          to="/learning"
          className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold text-slate-800">{t('Start Learning')}</h3>
          <p className="text-slate-600 mt-1">{t('Guided reading with focus tracking')}</p>
        </Link>
      </div>

      {/* Chatbot Floating Button */}
      <button
        onClick={() => setShowChatbot(!showChatbot)}
        className="fixed bottom-8 left-8 z-50 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-3 rounded-full shadow-xl transition"
      >
        {t('Chat')}
      </button>

      {/* Floating Chatbot Container */}
      {showChatbot && (
        <div className="fixed bottom-24 left-8 z-40 w-80 max-w-[90vw]">
          <Chatbot />
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
