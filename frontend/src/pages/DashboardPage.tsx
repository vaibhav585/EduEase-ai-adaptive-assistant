
import React from 'react';
import { useSignOut } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import Chatbot from '../components/Chatbot';
import { useTranslation } from 'react-i18next';

const DashboardPage: React.FC = () => {
  const [signOut, loading, error] = useSignOut(auth);
  const navigate = useNavigate();
  const [showChatbot, setShowChatbot] = React.useState(false);
  const { t, i18n } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex justify-between items-center p-4 bg-white shadow-md">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div>
          <button onClick={() => changeLanguage('en')} className="mr-2">English</button>
          <button onClick={() => changeLanguage('hi')} className="mr-2">Hindi</button>
          <button onClick={() => changeLanguage('ta')}>Tamil</button>
        </div>
        <button
          onClick={handleSignOut}
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          {t('Sign Out')}
        </button>
      </div>
      <div className="p-4">
        <p>{t('Welcome to your dashboard!')}</p>
        <a href="/upload" className="text-blue-500 hover:text-blue-800">{t('Upload a PDF to get started')}</a>
        <br />
        <a href="/content" className="text-blue-500 hover:text-blue-800">{t('Manage Content')}</a>
      </div>
      <button
        onClick={() => setShowChatbot(!showChatbot)}
        className="fixed bottom-4 left-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline"
      >
        {t('Chat')}
      </button>
      {showChatbot && <Chatbot />}
    </div>
  );
};

export default DashboardPage;
