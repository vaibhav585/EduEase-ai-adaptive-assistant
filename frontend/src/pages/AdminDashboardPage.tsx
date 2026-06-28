import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import api from "../services/api";

interface UserRecord {
  uid: string;
  email: string;
  role: string;
  grade_level: string | null;
  teacher_id: string | null;
}

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [gradeLevel, setGradeLevel] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    api.get("/admin/users")
      .then((res) => setUsers(res.data.users))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchUsers, []);

  const teachers = users.filter((u) => u.role === "teacher");
  const students = users.filter((u) => u.role === "student");
  const admins = users.filter((u) => u.role === "admin");

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const payload: any = { email, password, role };
      if (role === "student") {
        if (gradeLevel) payload.grade_level = gradeLevel;
        if (teacherId) payload.teacher_id = teacherId;
      }
      const res = await api.post("/admin/create-user", payload);
      setMessage(`Created ${res.data.role} account: ${res.data.email}`);
      setEmail("");
      setPassword("");
      setTeacherId("");
      fetchUsers();
    } catch (err: any) {
      setMessage(err?.response?.data?.detail || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const teacherEmailMap: Record<string, string> = {};
  teachers.forEach((t) => { teacherEmailMap[t.uid] = t.email; });

  const roleIcon = (r: string) =>
    r === "admin" ? "admin_panel_settings" : r === "teacher" ? "person" : "school";
  const roleBadge = (r: string) =>
    r === "admin"
      ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
      : r === "teacher"
      ? "bg-primary-fixed text-on-primary-fixed-variant"
      : "bg-surface-variant text-primary";

  return (
    <div className="min-h-screen bg-surface-bright animate-fade-in">
      <div className="max-w-[1440px] mx-auto px-4 md:px-12 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="font-heading text-sm font-semibold text-primary uppercase tracking-widest">Administration</span>
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-on-surface mt-1">Dashboard</h1>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-error text-on-error text-sm font-semibold shadow-lg hover:shadow-xl transition-all active:scale-95">
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Log Out
          </button>
        </div>

        {/* Bento KPI Grid */}
        <div className="bento-grid">
          <div className="col-span-12 md:col-span-4 glass-card p-8 rounded-3xl flex flex-col justify-between overflow-hidden relative group">
            <div className="z-10">
              <p className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">Total Students</p>
              <h2 className="font-heading text-4xl font-bold text-primary">{students.length}</h2>
              <div className="flex items-center gap-1.5 text-on-tertiary-fixed-variant mt-3">
                <span className="material-symbols-outlined text-[18px]">school</span>
                <span className="text-xs font-medium">Active learners</span>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-[160px]" style={{fontVariationSettings: "'FILL' 1"}}>groups</span>
            </div>
          </div>
          <div className="col-span-12 md:col-span-4 glass-card p-8 rounded-3xl flex flex-col justify-between overflow-hidden relative group">
            <div className="z-10">
              <p className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">Total Teachers</p>
              <h2 className="font-heading text-4xl font-bold text-primary">{teachers.length}</h2>
              <div className="flex items-center gap-1.5 text-on-tertiary-fixed-variant mt-3">
                <span className="material-symbols-outlined text-[18px]">person</span>
                <span className="text-xs font-medium">Educators on platform</span>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-[160px]" style={{fontVariationSettings: "'FILL' 1"}}>school</span>
            </div>
          </div>
          <div className="col-span-12 md:col-span-4 glass-card p-8 rounded-3xl flex flex-col justify-between overflow-hidden relative group bg-primary-container/10 border-primary/20">
            <div className="z-10">
              <div className="flex justify-between items-start">
                <p className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">System Admins</p>
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-tertiary-fixed-variant opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-tertiary-fixed-dim"></span>
                </span>
              </div>
              <h2 className="font-heading text-4xl font-bold text-primary">{admins.length}</h2>
            </div>
          </div>
        </div>

        {/* Grid: Form + Roster */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Create User Form */}
          <section className="lg:col-span-4 space-y-6">
            <div className="glass-card p-8 rounded-3xl flex flex-col gap-5">
              <header>
                <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest block mb-1">Administration</span>
                <h3 className="font-heading text-xl font-semibold text-on-surface">Create New User</h3>
              </header>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="font-heading text-xs font-semibold text-on-surface-variant">Select User Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setRole("teacher")}
                      className={`border rounded-xl py-2.5 flex flex-col items-center gap-1 transition-all active:scale-95 ${role === "teacher" ? "border-primary bg-primary/5" : "border-outline-variant/30 hover:border-primary"}`}>
                      <span className={`material-symbols-outlined ${role === "teacher" ? "text-primary" : "text-on-surface-variant"}`}>person</span>
                      <span className={`text-xs font-medium ${role === "teacher" ? "text-primary" : ""}`}>Teacher</span>
                    </button>
                    <button type="button" onClick={() => setRole("student")}
                      className={`border rounded-xl py-2.5 flex flex-col items-center gap-1 transition-all active:scale-95 ${role === "student" ? "border-primary bg-primary/5" : "border-outline-variant/30 hover:border-primary"}`}>
                      <span className={`material-symbols-outlined ${role === "student" ? "text-primary" : "text-on-surface-variant"}`}>school</span>
                      <span className={`text-xs font-medium ${role === "student" ? "text-primary" : ""}`}>Student</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="font-heading text-xs font-semibold text-on-surface-variant">Email Address</label>
                  <input type="email" required placeholder="user@eduease.edu" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="font-heading text-xs font-semibold text-on-surface-variant">Password</label>
                  <input type="password" required minLength={6} placeholder="Min 6 characters" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all" />
                </div>
                {role === "student" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="font-heading text-xs font-semibold text-on-surface-variant">Grade Level</label>
                      <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all">
                        <option value="">Select grade...</option>
                        {["1","2","3","4","5","6","7","8"].map((g) => (
                          <option key={g} value={g}>Grade {g}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5 pt-3 border-t border-outline-variant/30">
                      <label className="font-heading text-xs font-semibold text-on-surface-variant">Assign Teacher</label>
                      <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all">
                        <option value="">Select a teacher...</option>
                        {teachers.map((t) => (
                          <option key={t.uid} value={t.uid}>{t.email}</option>
                        ))}
                      </select>
                      <p className="text-xs text-on-surface-variant italic">Students must be assigned to a teacher upon creation.</p>
                    </div>
                  </>
                )}
                <button type="submit" disabled={creating}
                  className="w-full bg-primary-container text-white font-heading text-sm font-semibold py-3 rounded-xl hover:bg-primary transition-colors active:scale-[0.98] shadow-lg shadow-primary/20">
                  {creating ? "Creating..." : "Create Account"}
                </button>
              </form>
              {message && (
                <p className={`text-sm font-medium ${message.includes("Created") ? "text-tertiary-fixed-dim" : "text-error"}`}>
                  {message}
                </p>
              )}
            </div>
          </section>

          {/* User Roster */}
          <section className="lg:col-span-8">
            <div className="glass-card p-8 rounded-3xl h-full flex flex-col">
              <header className="flex justify-between items-center mb-6">
                <h3 className="font-heading text-xl font-semibold text-on-surface">User Roster</h3>
              </header>
              {loading ? (
                <p className="text-on-surface-variant text-center py-8">Loading...</p>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2">
                  {users.map((u) => (
                    <div key={u.uid} className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${u.role === "admin" ? "bg-tertiary/10" : u.role === "teacher" ? "bg-primary-fixed" : "bg-surface-variant"}`}>
                          <span className={`material-symbols-outlined ${u.role === "admin" ? "text-tertiary" : "text-primary"}`}>{roleIcon(u.role)}</span>
                        </div>
                        <div>
                          <p className="font-heading text-sm font-semibold text-on-surface">{u.email}</p>
                          <p className="text-xs text-on-surface-variant">
                            {u.grade_level ? `Grade ${u.grade_level}` : ""}
                            {u.teacher_id ? ` · ${teacherEmailMap[u.teacher_id] || "Assigned"}` : ""}
                            {!u.grade_level && !u.teacher_id ? "—" : ""}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${roleBadge(u.role)}`}>
                        {u.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Atmospheric background */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] bg-primary/5 rounded-full blur-[120px] motion-safe:animate-pulse"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[30%] h-[50%] bg-surface-variant/40 rounded-full blur-[120px]"></div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
