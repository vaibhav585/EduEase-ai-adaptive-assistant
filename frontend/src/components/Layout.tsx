import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BookOpenCheck,
  ClipboardList,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Settings,
  UploadCloud,
  X,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: React.ReactNode };

const NAV_ITEMS: NavItem[] = [
  { to: "/student-dashboard", label: "Student", icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> },
  { to: "/teacher-dashboard", label: "Teacher", icon: <ClipboardList className="h-4 w-4" aria-hidden="true" /> },
  { to: "/upload", label: "Upload", icon: <UploadCloud className="h-4 w-4" aria-hidden="true" /> },
  { to: "/learning", label: "Learning", icon: <BookOpenCheck className="h-4 w-4" aria-hidden="true" /> },
  { to: "/quiz", label: "Quiz", icon: <HelpCircle className="h-4 w-4" aria-hidden="true" /> },
  { to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" aria-hidden="true" /> },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // A route change should always close a still-open mobile menu — otherwise
  // it stays open over the new page, covering content the student just navigated to.
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const NavLink: React.FC<NavItem> = ({ to, label, icon }) => {
    const active = pathname === to;
    return (
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 px-3 py-2 rounded-control text-sm font-medium transition min-h-[44px]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2
        ${active ? "bg-primary-100 text-primary-700" : "text-slate-600 hover:bg-slate-100"}`}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-success-50 text-slate-800 font-[Poppins,sans-serif] flex flex-col">
      {/* Keyboard users land here first; the only way past a nav bar without a mouse. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
                   focus:rounded-control focus:bg-primary-700 focus:px-4 focus:py-2.5 focus:text-white"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 min-h-[44px]">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-primary-600 text-white">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xl sm:text-2xl font-semibold text-primary-700">EduEase</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} {...item} />
            ))}
          </nav>

          {/* Mobile: the nav had NO visible fallback below the sm breakpoint —
              a phone user previously had no way to navigate at all except the
              skip link. */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="sm:hidden flex h-11 w-11 items-center justify-center rounded-control text-slate-600 hover:bg-slate-100
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            {mobileOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>

        {mobileOpen && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="sm:hidden border-t border-slate-200 px-4 py-2 flex flex-col gap-1 bg-white"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} {...item} />
            ))}
          </nav>
        )}
      </header>

      {/* Main */}
      <main id="main-content" className="flex-1" tabIndex={-1}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
