import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";

const AUTH_PATHS = ["/login", "/register", "/"];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const [user] = useAuthState(auth);
  const [role, setRole] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) { setRole(null); return; }
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        setRole(snap.exists() ? snap.data()?.role || "student" : "student");
      } catch { setRole("student"); }
    };
    fetch();
  }, [user]);

  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    return <div className="min-h-screen bg-surface-bright">{children}</div>;
  }

  const navItems: { to: string; label: string; icon: string; roles?: string[] }[] = [
    { to: "/student-dashboard", label: "Dashboard", icon: "home", roles: ["student"] },
    { to: "/admin-dashboard", label: "Admin", icon: "admin_panel_settings", roles: ["admin"] },
    { to: "/teacher-dashboard", label: "Classroom", icon: "monitoring", roles: ["teacher"] },
    { to: "/upload", label: "Upload", icon: "upload_file", roles: ["student"] },
    { to: "/learning", label: "Learning", icon: "menu_book", roles: ["student"] },
    { to: "/quiz", label: "Quiz", icon: "quiz", roles: ["student"] },
  ];

  const visibleNav = navItems.filter((n) => !n.roles || !role || n.roles.includes(role));

  return (
    <div className="min-h-screen bg-surface-bright font-body text-on-surface">
      <nav className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl border-b border-white/20 shadow-sm">
        <div className="flex justify-between items-center px-6 py-2.5 max-w-[1440px] mx-auto">
          <div className="flex items-center gap-2">
            <span className="font-heading text-xl font-bold text-primary">EduEase</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {visibleNav.map((n) => (
              <Link key={n.to} to={n.to}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-heading font-semibold transition-all ${
                  pathname === n.to
                    ? "bg-primary-container/50 text-on-primary-container"
                    : "text-on-surface-variant hover:bg-surface-variant/30"
                }`}>
                <span className="material-symbols-outlined text-[18px]">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-xs font-bold text-primary border border-primary/20">
                {user.email?.charAt(0).toUpperCase() || "U"}
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
