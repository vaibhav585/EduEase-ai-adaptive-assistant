import React from 'react';
import {
  useCreateUserWithEmailAndPassword,
  useSignInWithEmailAndPassword,
} from 'react-firebase-hooks/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';

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
  'shadow appearance-none border rounded w-full py-2 px-3 text-slate-700 leading-tight ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500';

const AuthForm: React.FC<AuthFormProps> = ({ isRegister }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState('student');
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
      // Keep `primary` valid: clear it if the student just removed that condition.
      if (primary && !next.includes(primary as Disability)) setPrimary('');
      return next;
    });
  };

  // Blind/low-vision users get no value from webcam attention tracking and the
  // DASE blind profile drops ATT_SPAN entirely (roadmap §3.6). Don't even offer it.
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
        // Sensible starting points; the student can change all of these in Settings.
        ttsEnabled: disabilities.some((d) => ['blind', 'low_vision', 'dyslexia'].includes(d)),
        dyslexiaFont: disabilities.includes('dyslexia'),
        captionsAlways: disabilities.some((d) => ['deaf', 'hard_of_hearing'].includes(d)),
        voiceNav: disabilities.includes('blind'),
        describeImages: disabilities.some((d) => ['blind', 'low_vision'].includes(d)),
      },
    };

    await setDoc(doc(db, 'users', credential.user.uid), {
      email: credential.user.email,
      role,
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
    // Previously always sent everyone to /student-dashboard, so a newly registered
    // teacher got bounced by RoleGate. Route on the role we actually just stored.
    navigate(role === 'teacher' ? '/teacher-dashboard' : '/student-dashboard');
  }, [user, newUser, navigate, role]);

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label className="block text-slate-700 text-sm font-bold mb-2" htmlFor="email">
          Email
        </label>
        <input
          className={FIELD}
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-6">
        <label className="block text-slate-700 text-sm font-bold mb-2" htmlFor="password">
          Password
        </label>
        <input
          className={FIELD}
          id="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {isRegister && (
        <>
          <div className="mb-6">
            <label className="block text-slate-700 text-sm font-bold mb-2" htmlFor="role">
              Role
            </label>
            <select
              className={FIELD}
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>

          {role === 'student' && (
            <fieldset className="mb-6 border border-slate-200 rounded-lg p-4">
              <legend className="text-sm font-bold text-slate-700 px-2">
                How can we support you?
              </legend>
              <p className="text-xs text-slate-500 mb-3">
                Optional. This tailors how content is presented and how your progress is measured.
                You can skip this and change it any time — every feature works either way.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {(Object.keys(DISABILITY_LABELS) as Disability[]).map((d) => (
                  <label
                    key={d}
                    className="flex items-center gap-2 text-sm text-slate-700 py-1.5 px-2 rounded hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={disabilities.includes(d)}
                      onChange={() => toggleDisability(d)}
                    />
                    {DISABILITY_LABELS[d]}
                  </label>
                ))}
              </div>

              {disabilities.length > 1 && (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="primary">
                    Which affects your learning most?
                  </label>
                  <select
                    className={FIELD}
                    id="primary"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value as Disability)}
                  >
                    <option value="">Choose one</option>
                    {disabilities.map((d) => (
                      <option key={d} value={d}>
                        {DISABILITY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {disabilities.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="severity">
                    How much does it affect your studying?
                  </label>
                  <select
                    className={FIELD}
                    id="severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as Severity)}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="mild">A little</option>
                    <option value="moderate">Quite a lot</option>
                    <option value="significant">A great deal</option>
                  </select>
                </div>
              )}
            </fieldset>
          )}

          <fieldset className="mb-6 border border-slate-200 rounded-lg p-4">
            <legend className="text-sm font-bold text-slate-700 px-2">Your data</legend>
            <label className="flex items-start gap-2 text-sm text-slate-700 mb-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5"
                checked={consentData}
                onChange={(e) => setConsentData(e.target.checked)}
              />
              <span>
                I agree that EduEase can record how I answer questions and read lessons, so it can
                adapt to me and show my teacher my progress. <strong>Required.</strong>
              </span>
            </label>
            {role === 'student' && webcamOffered && (
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 mt-0.5"
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

      <div className="flex items-center justify-between gap-4">
        <button
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold
                     py-2.5 px-5 rounded-control focus:outline-none focus:ring-2 focus:ring-primary-500
                     disabled:opacity-50 min-h-[44px]"
          type="submit"
          disabled={loading || newLoading}
        >
          {isRegister ? <UserPlus className="h-4 w-4" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          {isRegister ? 'Register' : 'Sign In'}
        </button>
        {/* react-router Link, not a raw <a> — a plain anchor was forcing a full
            page reload on every "don't have an account?" click, discarding
            client-side state for no reason. */}
        <Link
          className="inline-block align-baseline font-bold text-sm text-primary-600 hover:text-primary-800"
          to={isRegister ? '/login' : '/register'}
        >
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
        </Link>
      </div>

      {formError && <p className="text-danger-600 text-sm mt-4">{formError}</p>}
      {(error || newError) && (
        <p className="text-danger-600 text-sm mt-4">{(error || newError)?.message}</p>
      )}
      {(loading || newLoading) && (
        <p className="text-primary-600 text-sm mt-4">
          {isRegister ? 'Creating your account…' : 'Signing in…'}
        </p>
      )}
    </form>
  );
};

export default AuthForm;
