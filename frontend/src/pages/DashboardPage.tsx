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

  const cards = [
    {
      to: "/upload",
      icon: "upload_file",
      title: t('Upload a PDF to get started'),
      desc: t('Generate simplified content & quizzes'),
      isHero: true,
    },
    {
      to: "/content",
      icon: "library_books",
      title: t('Manage Content'),
      desc: t('View and organize learning material'),
      isHero: true,
    },
    {
      to: "/learning",
      icon: "menu_book",
      title: t('Start Learning'),
      desc: t('Guided reading with focus tracking'),
      isHero: true,
    },
  ];

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest">{t('Student Dashboard')}</span>
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-on-surface mt-1">{t('Welcome to your dashboard!')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-card rounded-full px-1 py-0.5 flex">
              {["en", "hi", "ta"].map((lng) => (
                <button key={lng} onClick={() => changeLanguage(lng)}
                  className={`px-3 py-1.5 text-xs font-heading font-semibold rounded-full transition-all ${
                    i18n.language === lng ? "bg-primary text-white" : "text-on-surface-variant hover:text-primary"
                  }`}>
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={handleSignOut}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-error text-on-error text-sm font-heading font-semibold shadow-lg hover:shadow-xl transition-all active:scale-95">
              <span className="material-symbols-outlined text-[16px]">logout</span>
              {t('Sign Out')}
            </button>
          </div>
        </div>

        {/* Bento Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {cards.map((card) => (
            <Link key={card.to} to={card.to}
              className="bg-primary-container text-white group relative rounded-3xl p-8 min-h-[280px] flex flex-col justify-between overflow-hidden shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
              <div className="z-10">
                <span className="material-symbols-outlined text-4xl mb-4 block text-white/90"
                  style={{fontVariationSettings: "'FILL' 1"}}>{card.icon}</span>
                <h3 className="font-heading text-xl font-bold mb-2 text-white">{card.title}</h3>
                <p className="text-sm font-body leading-relaxed text-indigo-100">{card.desc}</p>
              </div>
              <div className="flex items-center gap-1 mt-4 z-10 text-white/90">
                <span className="font-heading text-xs font-semibold">Open</span>
                <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
              <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-outlined text-[160px]" style={{fontVariationSettings: "'FILL' 1"}}>{card.icon}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Chatbot FAB — rendered outside page content flow */}
      <div className="fixed bottom-4 right-4 z-[9999] flex items-end gap-3 pointer-events-auto" style={{isolation: "isolate"}}>
        {!showChatbot && (
          <div className="bg-white rounded-2xl px-4 py-2.5 shadow-xl border border-outline-variant/20 max-w-[200px] animate-fade-in">
            <p className="text-xs font-heading font-semibold text-on-surface">Ask me anything!</p>
            <p className="text-[10px] text-on-surface-variant font-body mt-0.5">I am your AI learning assistant</p>
          </div>
        )}
        <button onClick={() => setShowChatbot(!showChatbot)}
          className="w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group flex-shrink-0">
          <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">
            {showChatbot ? "close" : "auto_awesome"}
          </span>
        </button>
      </div>

      {showChatbot && <Chatbot />}
    </>
  );
};

export default DashboardPage;
