import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: {
          'Student Dashboard': 'Student Dashboard',
          'Welcome to your dashboard!': 'Welcome to your dashboard!',
          'Upload a PDF to get started': 'Upload a PDF to get started',
          'Generate simplified content & quizzes': 'Generate simplified content & quizzes',
          'Manage Content': 'Manage Content',
          'View and organize learning material': 'View and organize learning material',
          'Start Learning': 'Start Learning',
          'Guided reading with focus tracking': 'Guided reading with focus tracking',
          'Chat': 'Chat',
          'Sign Out': 'Sign Out',
        },
      },
      hi: {
        translation: {
          'Student Dashboard': 'छात्र डैशबोर्ड',
          'Welcome to your dashboard!': 'आपके डैशबोर्ड में आपका स्वागत है!',
          'Upload a PDF to get started': 'शुरू करने के लिए एक पीडीएफ अपलोड करें',
          'Generate simplified content & quizzes': 'सरलीकृत सामग्री और प्रश्नोत्तरी बनाएं',
          'Manage Content': 'सामग्री प्रबंधित करें',
          'View and organize learning material': 'सीखने की सामग्री देखें और व्यवस्थित करें',
          'Start Learning': 'सीखना शुरू करें',
          'Guided reading with focus tracking': 'ध्यान ट्रैकिंग के साथ मार्गदर्शित पठन',
          'Chat': 'बातचीत',
          'Sign Out': 'साइन आउट',
        },
      },
      ta: {
        translation: {
          'Student Dashboard': 'மாணவர் டாஷ்போர்டு',
          'Welcome to your dashboard!': 'உங்கள் டாஷ்போர்டுக்கு வரவேற்கிறோம்!',
          'Upload a PDF to get started': 'தொடங்குவதற்கு ஒரு PDF ஐ பதிவேற்றவும்',
          'Generate simplified content & quizzes': 'எளிமையான உள்ளடக்கம் மற்றும் வினாடி வினா உருவாக்கவும்',
          'Manage Content': 'உள்ளடக்கத்தை நிர்வகி',
          'View and organize learning material': 'கற்றல் பொருட்களைப் பார்க்கவும் ஒழுங்கமைக்கவும்',
          'Start Learning': 'கற்றலைத் தொடங்குங்கள்',
          'Guided reading with focus tracking': 'கவனம் கண்காணிப்புடன் வழிகாட்டும் வாசிப்பு',
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
