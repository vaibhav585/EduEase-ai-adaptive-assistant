import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import React from 'react';

export default function RoleGate({ children, expectedRole }: { children: React.ReactNode, expectedRole: string }) {
  const [user, loading] = useAuthState(auth);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [roleLoading, setRoleLoading] = React.useState(true);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (loading) return; // Wait until auth state is determined

    if (!user) {
      navigate('/login');
      setRoleLoading(false);
      return;
    }

    const fetchUserRole = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        const fetchedRole = docSnap.exists() ? (docSnap.data()?.role || 'student') : 'student';
        setUserRole(fetchedRole);

        // Only redirect if the fetched role doesn't match what this route expects
        if (fetchedRole !== expectedRole) {
          if (fetchedRole === 'teacher') {
            navigate('/teacher-dashboard');
          } else {
            navigate('/student-dashboard');
          }
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
        // Default to student on error
        setUserRole('student');
      } finally {
        setRoleLoading(false);
      }
    };

    fetchUserRole();
  }, [user, loading, expectedRole]);

  if (loading || roleLoading) {
    // Fires on every protected-route navigation — was a bare, unstyled
    // "Loading..." with no centering, matching nothing else in the app.
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary-500" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (user && userRole === expectedRole) {
    return <>{children}</>;
  }

  return null;
}