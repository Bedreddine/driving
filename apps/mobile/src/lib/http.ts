// Talks to the Spring Boot API. Keeps the login tokens and renews the short-lived access token
// with the refresh token when the server answers 401.
import { Platform } from 'react-native';
import { authStorage } from './storage';

// Phone apps need the full API address (EXPO_PUBLIC_API_URL). The website may leave it empty: it then calls
// the API on its own address (the Docker setup serves both behind one nginx), so one build works on any domain.
const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const sameOrigin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';
const baseUrl = configured || sameOrigin;
if (!baseUrl) {
  throw new Error('Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env.');
}

const KEY = 'taxi.tokens';
type Tokens = { access_token: string; refresh_token: string };

/** Thrown with the server's short code (SLOT_TAKEN, FORBIDDEN, ...) as message. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

let tokens: Tokens | null = readTokens();
const listeners = new Set<(signedIn: boolean) => void>();

function readTokens(): Tokens | null {
  try {
    const raw = authStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: Tokens | null) {
  tokens = t;
  try {
    if (t) authStorage?.setItem(KEY, JSON.stringify(t));
    else authStorage?.removeItem(KEY);
  } catch {
    // storage unavailable (private browsing): stay signed in for this session only
  }
  listeners.forEach((l) => l(!!t));
}

export const isSignedIn = () => !!tokens;
export const accessToken = () => tokens?.access_token ?? null;
export const apiUrl = baseUrl;

/** Called with true/false when the user signs in or out (including when a refresh fails). */
export function onAuthChange(listener: (signedIn: boolean) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

async function send(method: string, path: string, body: unknown, token: string | null) {
  // A file upload (FormData) sets its own multipart content type.
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// One refresh at a time, even if several requests got 401 together.
let refreshing: Promise<boolean> | null = null;
/** Gets a new access token with the refresh token. False (and signed out) if the session is over. */
export function refresh(): Promise<boolean> {
  if (!tokens) return Promise.resolve(false);
  refreshing ??= send('POST', '/api/auth/refresh', { refresh_token: tokens.refresh_token }, null)
    .then(async (res) => {
      if (!res.ok) {
        saveTokens(null);
        return false;
      }
      saveTokens((await res.json()) as Tokens);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body, tokens?.access_token ?? null);
    if (res.status === 401 && tokens && (await refresh())) {
      res = await send(method, path, body, tokens?.access_token ?? null);
    }
  } catch {
    throw new ApiError('NETWORK', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError((data as { error?: string })?.error ?? 'generic', res.status);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  /** multipart/form-data upload (e.g. the driver's photo). */
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

export async function signIn(email: string, password: string) {
  saveTokens(await request<Tokens>('POST', '/api/auth/login', { email, password }));
}

export async function signUp(body: { email: string; password: string; full_name: string; phone: string; language: string }) {
  saveTokens(await request<Tokens>('POST', '/api/auth/signup', body));
}

export async function signOut() {
  const current = tokens;
  saveTokens(null);
  if (current) await send('POST', '/api/auth/logout', { refresh_token: current.refresh_token }, null).catch(() => undefined);
}

/** Forget the tokens locally (after the account was deleted on the server). */
export const forgetSession = () => saveTokens(null);
