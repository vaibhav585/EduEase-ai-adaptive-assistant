import React from 'react';
import { useSignOut } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';
import Chatbot from '../components/Chatbot';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpenCheck, FolderOpen, LogOut, MessageCircle, UploadCloud, X } from 'lucide-react';

interface QuickLink {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

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

  const links: QuickLink[] = [
    {
      to: '/upload',
      title: t('Upload a PDF to get started'),
      description: t('Generate simplified content & quizzes'),
      icon: <UploadCloud className="h-6 w-6" aria-hidden="true" />,
    },
    {
      to: '/content',
      title: t('Manage Content'),
      description: t('View and organize learning material'),
      icon: <FolderOpen className="h-6 w-6" aria-hidden="true" />,
    },
    {
      to: '/learning',
      title: t('Start Learning'),
      description: t('Guided reading with focus tracking'),
      icon: <BookOpenCheck className="h-6 w-6" aria-hidden="true" />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-800">{t('Student Dashboard')}</h1>
          <p className="text-slate-600">{t('Welcome to your dashboard!')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-control p-1" role="group" aria-label="Language">
            {(['en', 'hi', 'ta'] as const).map((lng) => (
              <button
                key={lng}
                onClick={() => changeLanguage(lng)}
                aria-pressed={i18n.language === lng}
                className={`min-w-[44px] min-h-[36px] px-2 rounded-lg text-sm font-medium transition
                  ${i18n.language === lng ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2.5 rounded-control bg-danger-500 hover:bg-danger-600 text-white text-sm font-semibold shadow min-h-[44px]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('Sign Out')}
          </button>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="group rounded-card bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-primary-200 transition"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-control bg-primary-50 text-primary-600 group-hover:bg-primary-100 transition">
              {link.icon}
            </span>
            <h3 className="text-lg font-semibold text-slate-800 mt-3">{link.title}</h3>
            <p className="text-slate-600 mt-1 text-sm">{link.description}</p>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 mt-3 group-hover:gap-2 transition-all">
              Go <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      {/* Chatbot Floating Button */}
      <button
        onClick={() => setShowChatbot(!showChatbot)}
        aria-expanded={showChatbot}
        aria-label={showChatbot ? t('Close chat') : t('Chat')}
        className="fixed bottom-8 left-8 z-50 flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-5 py-3 rounded-full shadow-xl transition min-h-[44px]"
      >
        {showChatbot ? <X className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
        {showChatbot ? t('Close') : t('Chat')}
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
