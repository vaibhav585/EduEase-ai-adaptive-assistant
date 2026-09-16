import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { useProfile } from "../hooks/useProfile";

const AUTH_PATHS = ["/login", "/register", "/"];

const ROLE_HOME: Record<string, string> = {
  admin: "/admin-dashboard",
  teacher: "/teacher-dashboard",
  student: "/student-dashboard",
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Also applies the signed-in student's accessibility prefs (font scale,
  // high contrast, dyslexia font, reduced motion) to <html> on every page,
  // not just when visiting Settings.
  const { user, role } = useProfile();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    return <div className="min-h-screen bg-surface-bright">{children}</div>;
  }

  const homePath = ROLE_HOME[role ?? ""] ?? "/student-dashboard";

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-surface-bright font-body text-on-surface">
      <nav className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl border-b border-white/20 shadow-sm">
        <div className="flex justify-between items-center px-6 py-2.5 max-w-[1440px] mx-auto">
          <Link to={homePath} className="flex items-center gap-2">
            <span className="font-heading text-xl font-bold text-primary">EduEase</span>
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              className="w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center text-sm font-bold text-primary border border-primary/20 hover:ring-2 hover:ring-primary/30 transition-all"
            >
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-64 glass-card rounded-2xl p-2 shadow-xl animate-fade-in"
              >
                <div className="px-3 py-2.5 border-b border-outline-variant/30 mb-1">
                  <p className="text-sm font-heading font-semibold text-on-surface truncate">{user?.email ?? "Signed in"}</p>
                  {role && <p className="text-xs text-on-surface-variant capitalize mt-0.5">{role}</p>}
                </div>

                {role === "student" && (
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-heading font-semibold transition-all ${
                      pathname === "/settings"
                        ? "bg-primary-container/50 text-on-primary-container"
                        : "text-on-surface-variant hover:bg-surface-variant/30"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">tune</span>
                    Settings
                  </Link>
                )}

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-heading font-semibold text-error hover:bg-error-container/40 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-16 min-h-screen">
        <div className="mx-auto max-w-[1440px] px-4 md:px-12 py-6">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
