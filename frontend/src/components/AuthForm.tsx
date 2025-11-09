
import React from 'react';
import { useSignInWithEmailAndPassword, useCreateUserWithEmailAndPassword } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';

interface AuthFormProps {
  isRegister?: boolean;
}

const AuthForm: React.FC<AuthFormProps> = ({ isRegister }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState('student'); // Default role
  const [signInWithEmailAndPassword, user, loading, error] = useSignInWithEmailAndPassword(auth);
  const [createUserWithEmailAndPassword, newUser, newLoading, newError] = useCreateUserWithEmailAndPassword(auth);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleSubmit called');
    console.log('Email:', email, 'Password:', password);
    if (isRegister) {
      console.log('Calling createUserWithEmailAndPassword');
      const userCredential = await createUserWithEmailAndPassword(email, password);
      if (userCredential) {
        // Store user role in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email: userCredential.user.email,
          role: role,
        });
      }
    } else {
      console.log('Calling signInWithEmailAndPassword');
      signInWithEmailAndPassword(email, password);
    }
  };

  React.useEffect(() => {
    console.log('AuthForm useEffect triggered');
    console.log('User:', user);
    console.log('New User:', newUser);
    console.log('Loading:', loading);
    console.log('Error:', error);
    console.log('New Loading:', newLoading);
    console.log('New Error:', newError);
    if (user || newUser) {
      console.log('Navigating to student dashboard...');
      navigate('/student-dashboard');
    }
  }, [user, newUser, navigate, loading, error, newLoading, newError]);

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
          Email
        </label>
        <input
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          id="email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="mb-6">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
          Password
        </label>
        <input
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
          id="password"
          type="password"
          placeholder="******************"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {isRegister && (
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="role">
            Role
          </label>
          <select
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          type="submit"
        >
          {isRegister ? 'Register' : 'Sign In'}
        </button>
        <a
          className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800"
          href={isRegister ? '/login' : '/register'}
        >
          {isRegister ? 'Already have an account?' : 'Don\'t have an account?'}
        </a>
      </div>
      {(error || newError) && (
        <p className="text-red-500 text-xs italic mt-4">{(error || newError)?.message}</p>
      )}
      {loading && <p className="text-blue-500 text-xs italic mt-4">Signing in...</p>}
      {newLoading && <p className="text-blue-500 text-xs italic mt-4">Registering...</p>}
      {error && <p className="text-red-500 text-xs italic mt-4">Error: {error.message}</p>}
      {newError && <p className="text-red-500 text-xs italic mt-4">Error: {newError.message}</p>}
    </form>
  );
};

export default AuthForm;
