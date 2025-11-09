import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebase';
import { useNavigate } from 'react-router-dom'; // Use useNavigate for programmatic navigation
import { doc, getDoc } from 'firebase/firestore';
import React from 'react';

export default function RoleGate({ children, expectedRole }: { children: React.ReactNode, expectedRole: string }) {
  const [user, loading] = useAuthState(auth);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [roleLoading, setRoleLoading] = React.useState(true);
  const navigate = useNavigate();

  console.log('RoleGate - User:', user);
  console.log('RoleGate - Loading:', loading);

  React.useEffect(() => {
    const fetchUserRole = async () => {
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const fetchedRole = docSnap.data()?.role || 'student';
          setUserRole(fetchedRole);
          // Redirect based on fetched role
          if (fetchedRole === 'teacher') {
            navigate('/teacher-dashboard');
          } else {
            navigate('/student-dashboard');
          }
        } else {
          // If no role found in Firestore, default to student and redirect
          setUserRole('student');
          navigate('/student-dashboard');
        }
      } else {
        setUserRole(null);
        // If no user, redirect to login
        navigate('/login');
      }
      setRoleLoading(false);
    };

    if (!loading) { // Only fetch role once auth state is determined
      if (!user) {
        navigate('/login');
        setRoleLoading(false);
        return;
      }

      const fetchUserRole = async () => {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        const fetchedRole = docSnap.exists() ? (docSnap.data()?.role || 'student') : 'student';
        setUserRole(fetchedRole);

        if (fetchedRole !== expectedRole) {
          // Redirect to appropriate dashboard if role doesn't match expectedRole for this route
          if (fetchedRole === 'teacher') {
            navigate('/teacher-dashboard');
          } else {
            navigate('/student-dashboard');
          }
        }
        setRoleLoading(false);
      };
      fetchUserRole();
    }
  }, [user, loading, navigate]);

  if (loading || roleLoading) {
    return <div>Loading...</div>;
  }

  // If user is authenticated and role is determined, render children if role matches expectedRole
  // Otherwise, the useEffect above would have already redirected.
  if (user && userRole === expectedRole) {
    return <>{children}</>;
  }

  // Fallback for any unhandled cases, though useEffect should handle redirects
  return null;
}