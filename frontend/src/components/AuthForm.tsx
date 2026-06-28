import React from 'react';
import { useSignInWithEmailAndPassword } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';

const AuthForm: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [signInWithEmailAndPassword, user, loading, error] = useSignInWithEmailAndPassword(auth);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    signInWithEmailAndPassword(email, password);
  };

  React.useEffect(() => {
    if (!user) return;
    const redirect = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.user.uid));
        const role = snap.exists() ? (snap.data()?.role || 'student') : 'student';
        if (role === 'admin') navigate('/admin-dashboard');
        else if (role === 'teacher') navigate('/teacher-dashboard');
        else navigate('/student-dashboard');
      } catch {
        navigate('/student-dashboard');
      }
    };
    redirect();
  }, [user, navigate]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="email">Email Address</label>
        <input
          className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-body"
          id="email" type="email" placeholder="you@eduease.edu"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="password">Password</label>
        <input
          className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-body"
          id="password" type="password" placeholder="Enter your password"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button
        className="w-full bg-primary-container text-white font-heading text-sm font-semibold py-3.5 rounded-xl hover:bg-primary transition-colors active:scale-[0.98] shadow-lg shadow-primary/20"
        type="submit"
        disabled={loading}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      {error && (
        <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs font-body">
          {error.message}
        </div>
      )}
    </form>
  );
};

export default AuthForm;
