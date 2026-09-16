import React from 'react';
import {
  useCreateUserWithEmailAndPassword,
  useSignInWithEmailAndPassword,
} from 'react-firebase-hooks/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';

import { auth, db } from '../services/firebase';
import {
  CONSENT_VERSION,
  DEFAULT_PREFS,
  Disability,
  DISABILITY_LABELS,
  Profile,
  Severity,
} from '../types/profile';

interface AuthFormProps {
  isRegister?: boolean;
}

const FIELD =
  'w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface ' +
  'focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-body';

const AuthForm: React.FC<AuthFormProps> = ({ isRegister }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState('student');
  const [gradeLevel, setGradeLevel] = React.useState('');
  const [disabilities, setDisabilities] = React.useState<Disability[]>([]);
  const [primary, setPrimary] = React.useState<Disability | ''>('');
  const [severity, setSeverity] = React.useState<Severity | ''>('');
  const [consentData, setConsentData] = React.useState(false);
  const [consentWebcam, setConsentWebcam] = React.useState(false);
  const [formError, setFormError] = React.useState('');

  const [signInWithEmailAndPassword, user, loading, error] = useSignInWithEmailAndPassword(auth);
  const [createUserWithEmailAndPassword, newUser, newLoading, newError] =
    useCreateUserWithEmailAndPassword(auth);
  const navigate = useNavigate();

  const toggleDisability = (d: Disability) => {
    setDisabilities((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
      if (primary && !next.includes(primary as Disability)) setPrimary('');
      return next;
    });
  };

  // Blind/low-vision users get no value from webcam attention tracking.
  const webcamOffered = !disabilities.some((d) => d === 'blind' || d === 'low_vision');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!isRegister) {
      signInWithEmailAndPassword(email, password);
      return;
    }

    if (!consentData) {
      setFormError('You need to agree to data collection to create an account.');
      return;
    }

    const credential = await createUserWithEmailAndPassword(email, password);
    if (!credential) return; // hook surfaces the error below

    const profile: Profile = {
      disabilities,
      primary: (primary || disabilities[0] || null) as Disability | null,
      severity: (severity || null) as Severity | null,
      prefs: {
        ...DEFAULT_PREFS,
        webcamAttention: webcamOffered && consentWebcam,
        ttsEnabled: disabilities.some((d) => ['blind', 'low_vision', 'dyslexia'].includes(d)),
        dyslexiaFont: disabilities.includes('dyslexia'),
        captionsAlways: disabilities.some((d) => ['deaf', 'hard_of_hearing'].includes(d)),
        describeImages: disabilities.some((d) => ['blind', 'low_vision'].includes(d)),
      },
    };

    await setDoc(doc(db, 'users', credential.user.uid), {
      email: credential.user.email,
      role,
      grade_level: role === 'student' ? (gradeLevel || null) : null,
      profile,
      consent: {
        dataCollection: consentData,
        webcam: webcamOffered && consentWebcam,
        disabilityDisclosure: disabilities.length > 0,
        grantedAt: serverTimestamp(),
        version: CONSENT_VERSION,
      },
      createdAt: serverTimestamp(),
    });
  };

  React.useEffect(() => {
    const signedIn = user || newUser;
    if (!signedIn) return;
    if (isRegister) {
      navigate(role === 'teacher' ? '/teacher-dashboard' : '/student-dashboard');
      return;
    }
    // Sign-in: role comes from Firestore, not the (unset) local `role` state.
    const redirect = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', signedIn.user.uid));
        const r = snap.exists() ? snap.data()?.role || 'student' : 'student';
        if (r === 'admin') navigate('/admin-dashboard');
        else if (r === 'teacher') navigate('/teacher-dashboard');
        else navigate('/student-dashboard');
      } catch {
        navigate('/student-dashboard');
      }
    };
    redirect();
  }, [user, newUser, navigate, role, isRegister]);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-1.5">
        <label className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="email">
          Email Address
        </label>
        <input
          className={FIELD}
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@eduease.edu"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="password">
          Password
        </label>
        <input
          className={FIELD}
          id="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          placeholder="Enter your password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {isRegister && (
        <>
          <div className="space-y-1.5">
            <label className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="role">
              I am a
            </label>
            <select className={FIELD} id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>

          {role === 'student' && (
            <div className="space-y-1.5">
              <label className="font-heading text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="grade">
                Grade level
              </label>
              <select className={FIELD} id="grade" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>
                <option value="">Choose one</option>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={String(g)}>Grade {g}</option>
                ))}
              </select>
            </div>
          )}

          {role === 'student' && (
            <fieldset className="rounded-2xl border border-outline-variant p-4">
              <legend className="text-xs font-heading font-bold text-on-surface px-2">
                How can we support you?
              </legend>
              <p className="text-xs text-on-surface-variant mb-3 font-body">
                Optional. This tailors how content is presented and how your progress is measured.
                You can skip this and change it any time in Settings — every feature works either way.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {(Object.keys(DISABILITY_LABELS) as Disability[]).map((d) => (
                  <label
                    key={d}
                    className="flex items-center gap-2 text-sm text-on-surface py-1.5 px-2 rounded-xl hover:bg-surface-container-low cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={disabilities.includes(d)}
                      onChange={() => toggleDisability(d)}
                    />
                    {DISABILITY_LABELS[d]}
                  </label>
                ))}
              </div>

              {disabilities.length > 1 && (
                <div className="mb-4">
                  <label className="block text-xs font-heading font-bold text-on-surface mb-1" htmlFor="primary">
                    Which affects your learning most?
                  </label>
                  <select className={FIELD} id="primary" value={primary} onChange={(e) => setPrimary(e.target.value as Disability)}>
                    <option value="">Choose one</option>
                    {disabilities.map((d) => (
                      <option key={d} value={d}>{DISABILITY_LABELS[d]}</option>
                    ))}
                  </select>
                </div>
              )}

              {disabilities.length > 0 && (
                <div>
                  <label className="block text-xs font-heading font-bold text-on-surface mb-1" htmlFor="severity">
                    How much does it affect your studying?
                  </label>
                  <select className={FIELD} id="severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                    <option value="">Prefer not to say</option>
                    <option value="mild">A little</option>
                    <option value="moderate">Quite a lot</option>
                    <option value="significant">A great deal</option>
                  </select>
                </div>
              )}
            </fieldset>
          )}

          <fieldset className="rounded-2xl border border-outline-variant p-4">
            <legend className="text-xs font-heading font-bold text-on-surface px-2">Your data</legend>
            <label className="flex items-start gap-2 text-sm text-on-surface mb-3 cursor-pointer font-body">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5 accent-primary"
                checked={consentData}
                onChange={(e) => setConsentData(e.target.checked)}
              />
              <span>
                I agree that EduEase can record how I answer questions and read lessons, so it can
                adapt to me and show my teacher my progress. <strong>Required.</strong>
              </span>
            </label>
            {role === 'student' && webcamOffered && (
              <label className="flex items-start gap-2 text-sm text-on-surface cursor-pointer font-body">
                <input
                  type="checkbox"
                  className="h-4 w-4 mt-0.5 accent-primary"
                  checked={consentWebcam}
                  onChange={(e) => setConsentWebcam(e.target.checked)}
                />
                <span>
                  I allow the camera to check whether I am still in front of the screen. Optional,
                  and you can turn it off any time. No video is ever recorded or sent anywhere.
                </span>
              </label>
            )}
          </fieldset>
        </>
      )}

      <button
        className="w-full bg-primary-container text-white font-heading text-sm font-semibold py-3.5 rounded-xl hover:bg-primary transition-colors active:scale-[0.98] shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
        type="submit"
        disabled={loading || newLoading}
      >
        <span className="material-symbols-outlined text-[18px]">{isRegister ? 'person_add' : 'login'}</span>
        {isRegister ? (newLoading ? 'Creating your account…' : 'Register') : (loading ? 'Signing in…' : 'Sign In')}
      </button>

      <p className="text-center text-sm font-body">
        <Link className="font-heading font-semibold text-primary hover:text-primary-container" to={isRegister ? '/login' : '/register'}>
          {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
        </Link>
      </p>

      {formError && (
        <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs font-body">{formError}</div>
      )}
      {(error || newError) && (
        <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs font-body">
          {(error || newError)?.message}
        </div>
      )}
    </form>
  );
};

export default AuthForm;
