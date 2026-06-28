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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-indigo-800">Admin Dashboard</h1>
          <p className="text-slate-600 mt-1">Manage users, roles, and system access</p>
        </div>
        <button onClick={handleLogout}
          className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold shadow">
          Log Out
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Students</p>
          <p className="text-3xl font-semibold text-indigo-600 mt-1">{students.length}</p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Teachers</p>
          <p className="text-3xl font-semibold text-emerald-600 mt-1">{teachers.length}</p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Admins</p>
          <p className="text-3xl font-semibold text-amber-600 mt-1">{admins.length}</p>
        </div>
      </div>

      {/* Create User Form */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Create New User</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="email" required placeholder="Email address" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-slate-200 rounded-lg p-2" />
          <input type="password" required minLength={6} placeholder="Password (min 6 chars)" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-slate-200 rounded-lg p-2" />
          <select value={role} onChange={(e) => setRole(e.target.value as "student" | "teacher")}
            className="border border-slate-200 rounded-lg p-2">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
          {role === "student" && (
            <>
              <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}
                className="border border-slate-200 rounded-lg p-2">
                <option value="">Grade Level (optional)</option>
                {["1","2","3","4","5","6","7","8"].map((g) => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
              </select>
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
                className="border border-slate-200 rounded-lg p-2 md:col-span-2">
                <option value="">Assign Teacher (optional)</option>
                {teachers.map((t) => (
                  <option key={t.uid} value={t.uid}>{t.email}</option>
                ))}
              </select>
            </>
          )}
          <button type="submit" disabled={creating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg md:col-span-2">
            {creating ? "Creating..." : "Create User"}
          </button>
        </form>
        {message && (
          <p className={`mt-3 text-sm ${message.includes("Created") ? "text-emerald-600" : "text-red-500"}`}>
            {message}
          </p>
        )}
      </div>

      {/* User Roster */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">All Users</h2>
        {loading ? (
          <p className="text-slate-500 py-4 text-center">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="p-3 text-left">Email</th>
                  <th className="p-3 text-left">Role</th>
                  <th className="p-3 text-left">Grade</th>
                  <th className="p-3 text-left">Assigned Teacher</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50">
                    <td className="p-3 font-medium">{u.email}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        u.role === "admin" ? "bg-amber-100 text-amber-700" :
                        u.role === "teacher" ? "bg-emerald-100 text-emerald-700" :
                        "bg-indigo-100 text-indigo-700"
                      }`}>{u.role}</span>
                    </td>
                    <td className="p-3">{u.grade_level || "—"}</td>
                    <td className="p-3">{u.teacher_id ? (teacherEmailMap[u.teacher_id] || u.teacher_id) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboardPage;
