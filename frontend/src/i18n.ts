
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: {
          'Welcome to your dashboard!': 'Welcome to your dashboard!',
          'Upload a PDF to get started': 'Upload a PDF to get started',
          'Manage Content': 'Manage Content',
          'Chat': 'Chat',
          'Sign Out': 'Sign Out',
        },
      },
      hi: {
        translation: {
          'Welcome to your dashboard!': 'आपके डैशबोर्ड में आपका स्वागत है!',
          'Upload a PDF to get started': 'शुरू करने के लिए एक पीडीएफ अपलोड करें',
          'Manage Content': 'सामग्री प्रबंधित करें',
          'Chat': 'बातचीत',
          'Sign Out': 'साइन आउट',
        },
      },
      ta: {
        translation: {
          'Welcome to your dashboard!': 'உங்கள் டாஷ்போர்டுக்கு வரவேற்கிறோம்!',
          'Upload a PDF to get started': 'தொடங்குவதற்கு ஒரு PDF ஐ பதிவேற்றவும்',
          'Manage Content': 'உள்ளடக்கத்தை நிர்வகி',
          'Chat': 'அரட்டை',
          'Sign Out': 'வெளியேறு',
        },
      },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
