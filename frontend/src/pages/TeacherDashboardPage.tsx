import React from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from "recharts";

const TeacherDashboardPage: React.FC = () => {
  const students = [
    {
      id: 1,
      name: "Aarav Kumar",
      lastLogin: "2025-11-09",
      topicsCompleted: 8,
      totalTopics: 10,
      quizScores: [75, 82, 90, 88],
      focusScore: 85,
      notes: "Improved reading speed but needs to focus on comprehension."
    },
    {
      id: 2,
      name: "Meera Patel",
      lastLogin: "2025-11-08",
      topicsCompleted: 6,
      totalTopics: 10,
      quizScores: [60, 72, 80, 78],
      focusScore: 70,
      notes: "Gets distracted often. Try shorter sessions with more visuals."
    },
    {
      id: 3,
      name: "Rohan Singh",
      lastLogin: "2025-11-09",
      topicsCompleted: 10,
      totalTopics: 10,
      quizScores: [88, 92, 95, 97],
      focusScore: 92,
      notes: "Excellent focus and understanding. Ready for advanced topics."
    }
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-indigo-800">Teacher Dashboard</h1>
        <p className="text-slate-600 mt-1">Overview of student engagement & learning outcomes</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Average Focus</p>
          <p className="text-3xl font-semibold text-emerald-600 mt-1">
            {Math.round(students.reduce((a, s) => a + s.focusScore, 0) / students.length)}%
          </p>
          <p className="text-xs text-slate-400 mt-2">Based on webcam attention</p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Average Quiz Score</p>
          <p className="text-3xl font-semibold text-indigo-600 mt-1">
            {Math.round(students.reduce((a, s) => a + (s.quizScores.reduce((x, y) => x + y, 0) / s.quizScores.length), 0) / students.length)}%
          </p>
          <p className="text-xs text-slate-400 mt-2">Across recent quizzes</p>
        </div>
        <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500">Active Students</p>
          <p className="text-3xl font-semibold text-amber-600 mt-1">{students.length}</p>
          <p className="text-xs text-slate-400 mt-2">Logged in this week</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 mb-3 text-center">Average Focus Ratio</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={[
                  { name: "Focused", value: 82 },
                  { name: "Distracted", value: 18 },
                ]}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label
                dataKey="value"
              >
                <Cell fill="#22C55E" />
                <Cell fill="#F97316" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-800 mb-3 text-center">Average Quiz Scores by Student</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={students.map(s => ({
                name: s.name,
                avgScore: Math.round(s.quizScores.reduce((a, b) => a + b, 0) / s.quizScores.length),
              }))}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgScore" fill="#4F46E5" name="Average Quiz Score" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100">
        <h2 className="text-xl font-semibold text-slate-800 mb-4 text-center">Student Progress Overview</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Last Login</th>
                <th className="p-3 text-left">Topics Completed</th>
                <th className="p-3 text-left">Quiz Avg</th>
                <th className="p-3 text-left">Focus Score</th>
                <th className="p-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium">{student.name}</td>
                  <td className="p-3">{student.lastLogin}</td>
                  <td className="p-3">
                    <div className="w-full bg-slate-200/70 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full"
                        style={{ width: `${(student.topicsCompleted / student.totalTopics) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {student.topicsCompleted}/{student.totalTopics}
                    </span>
                  </td>
                  <td className="p-3">
                    {Math.round(student.quizScores.reduce((a, b) => a + b, 0) / student.quizScores.length)}%
                  </td>
                  <td className="p-3">
                    <span className={`font-semibold ${student.focusScore > 80 ? "text-emerald-600" : student.focusScore > 60 ? "text-amber-600" : "text-rose-600"}`}>
                      {student.focusScore}%
                    </span>
                  </td>
                  <td className="p-3 text-slate-700">{student.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboardPage;
