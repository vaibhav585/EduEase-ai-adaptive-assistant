import { useCallback, useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { auth, db } from '../services/firebase';
import {
  applyPrefs,
  Consent,
  DEFAULT_PREFS,
  DEFAULT_PROFILE,
  Prefs,
  Profile,
} from '../types/profile';

/**
 * Single source of truth for the signed-in student's accessibility profile.
 * DATA_CONTRACT.md §2 — signature is frozen, Tracks A/B/C call this.
 */
export function useProfile() {
  const [user, authLoading] = useAuthState(auth);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(DEFAULT_PROFILE);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data();
        if (cancelled) return;
        // Merge against defaults: users created before Phase 0 have no `profile`
        // field at all, and every screen must still work for them.
        const merged: Profile = {
          ...DEFAULT_PROFILE,
          ...(data?.profile ?? {}),
          prefs: { ...DEFAULT_PREFS, ...(data?.profile?.prefs ?? {}) },
        };
        setProfile(merged);
        setConsent(data?.consent ?? null);
        setRole(data?.role ?? 'student');
        applyPrefs(merged.prefs);
      } catch (err) {
        console.error('[useProfile] load failed, using defaults', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const savePrefs = useCallback(
    async (patch: Partial<Prefs>) => {
      const next = { ...profile, prefs: { ...profile.prefs, ...patch } };
      setProfile(next);
      applyPrefs(next.prefs);
      if (user) await updateDoc(doc(db, 'users', user.uid), { 'profile.prefs': next.prefs });
    },
    [profile, user],
  );

  const saveProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const next = { ...profile, ...patch };
      setProfile(next);
      if (user) await updateDoc(doc(db, 'users', user.uid), { profile: next });
    },
    [profile, user],
  );

  return {
    user,
    uid: user?.uid ?? null,
    role,
    profile,
    consent,
    loading: loading || authLoading,
    savePrefs,
    saveProfile,
  };
}
