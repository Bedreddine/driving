import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, isSignedIn, onAuthChange, signOut as httpSignOut } from './http';
import { errorText, translate, type Lang, type TextKey } from './i18n';

export type Role = 'customer' | 'driver' | 'admin';
export type Profile = { id: string; email: string; full_name: string; phone: string | null; language: Lang; roles: Role[] };

type AuthState = {
  loading: boolean;
  signedIn: boolean;
  profile: Profile | null;
  roles: Role[];
  lang: Lang;
  t: (key: TextKey) => string;
  err: (code: string | undefined) => string;
  setLanguage: (lang: Lang) => Promise<void>;
  reloadProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const deviceLang = (): Lang => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'fr');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(isSignedIn);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSignedIn);

  const loadProfile = useCallback(
    () =>
      api
        .get<Profile>('/api/me')
        .then(setProfile)
        .catch(() => setProfile(null))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    if (isSignedIn()) void loadProfile();
    return onAuthChange((now) => {
      setSignedIn(now);
      if (now) {
        setLoading(true);
        void loadProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
  }, [loadProfile]);

  const lang: Lang = profile?.language ?? deviceLang();
  const roles = useMemo(() => profile?.roles ?? [], [profile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      signedIn,
      profile,
      roles,
      lang,
      t: (key) => translate(lang, key),
      err: (code) => errorText(lang, code),
      setLanguage: async (l) => {
        setProfile(await api.patch<Profile>('/api/me', { language: l }));
      },
      reloadProfile: loadProfile,
      signOut: httpSignOut,
    }),
    [loading, signedIn, profile, roles, lang, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const isStaff = (roles: Role[]) => roles.includes('driver') || roles.includes('admin');
