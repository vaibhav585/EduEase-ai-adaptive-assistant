import React from "react";
import { Link, useLocation } from "react-router-dom";

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();

  const NavLink: React.FC<{ to: string; label: string }> = ({ to, label }) => {
    const active = pathname === to;
    return (
      <Link
        to={to}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition
        ${active ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 text-slate-800 font-[Poppins,sans-serif] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-500/90" />
            <span className="text-xl sm:text-2xl font-semibold text-indigo-700">EduEase</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-2">
            <NavLink to="/student-dashboard" label="Student" />
            <NavLink to="/teacher-dashboard" label="Teacher" />
            <NavLink to="/upload" label="Upload" />
            <NavLink to="/learning" label="Learning" />
            <NavLink to="/quiz" label="Quiz" />
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
