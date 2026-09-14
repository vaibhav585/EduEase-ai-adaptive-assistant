/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Semantic tokens, not fixed indigo-600 etc scattered across 15 files.
      // Single place to reskin the app, and a class like `bg-primary-600`
      // documents intent (this is THE brand action color) where `bg-indigo-600`
      // only documents a color choice that happened to be indigo.
      colors: {
        primary: {
          50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc",
          400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca",
          800: "#3730a3", 900: "#312e81",
        },
        success: {
          50: "#ecfdf5", 100: "#d1fae5", 500: "#10b981", 600: "#059669", 700: "#047857",
        },
        warning: {
          50: "#fffbeb", 100: "#fef3c7", 500: "#f59e0b", 600: "#d97706", 700: "#b45309",
        },
        danger: {
          50: "#fff1f2", 100: "#ffe4e6", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c",
        },
      },
      borderRadius: {
        card: "1rem",     // rounded-2xl, the app's standard card corner
        control: "0.75rem", // rounded-xl, the app's standard button/input corner
      },
    },
  },
  plugins: [],
}
