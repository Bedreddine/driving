import type { Session } from '@supabase/supabase-js';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { errorText, translate, type Lang, type TextKey } from './i18n';
import { supabase } from './supabase';

export type Role = 'customer' | 'driver' | 'admin';
export type Profile = { id: string; full_name: string; phone: string | null; language: Lang };

type AuthState = {
  loading: boolean;
  session: Session | null;
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
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, language').eq('id', s.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', s.user.id),
    ]);
    setProfile((p as Profile | null) ?? null);
    setRoles(((r ?? []) as { role: Role }[]).map((x) => x.role));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Do not await inside the callback (supabase-js deadlock rule); load afterwards.
      setTimeout(() => void loadProfile(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const lang: Lang = profile?.language ?? deviceLang();

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      roles,
      lang,
      t: (key) => translate(lang, key),
      err: (code) => errorText(lang, code),
      setLanguage: async (l) => {
        if (!profile) return;
        await supabase.from('profiles').update({ language: l }).eq('id', profile.id);
        setProfile({ ...profile, language: l });
      },
      reloadProfile: () => loadProfile(session),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, profile, roles, lang, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const isStaff = (roles: Role[]) => roles.includes('driver') || roles.includes('admin');
