import axios from 'axios';
import { auth } from './firebase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

// Resolves once Firebase has determined the initial auth state (session restored or empty).
// Without this, auth.currentUser is null on the first request after a page load,
// causing a 401 even when the user is logged in.
const authReady = new Promise<void>((resolve) => {
  const unsub = auth.onAuthStateChanged(() => {
    unsub();
    resolve();
  });
});

api.interceptors.request.use(async (config) => {
  await authReady;
  const token = await auth.currentUser?.getIdToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
