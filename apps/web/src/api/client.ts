const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';
const TOKEN_KEY = 'devportal.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage μπλοκαρισμένο — η συνεδρία κρατάει μέχρι το refresh */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

type QueryValue = string | number | undefined | null;

export async function api<T>(
  path: string,
  opts: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; query?: Record<string, QueryValue> } = {},
): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Δεν υπάρχει σύνδεση με τον server.');
  }

  if (res.status === 401 && token) onUnauthorized();

  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = await res.json();
      message = Array.isArray(j.message) ? j.message.join(' · ') : (j.message ?? message);
    } catch {
      /* όχι JSON */
    }
    throw new ApiError(res.status, message);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const KNOWN: Record<string, string> = {
  'Invalid credentials': 'Λάθος email ή κωδικός.',
  'Code is identical to the current version': 'Ο κώδικας είναι ίδιος με την τρέχουσα έκδοση.',
  'User exists': 'Υπάρχει ήδη χρήστης με αυτό το email.',
  'Customer number already exists': 'Υπάρχει ήδη πελάτης με αυτόν τον αριθμό.',
  'Environment already exists': 'Το περιβάλλον υπάρχει ήδη.',
  'Both steps must belong to this workflow': 'Και τα δύο βήματα πρέπει να ανήκουν σε αυτό το workflow.',
  'customerNumber must be exactly 7 digits': 'Ο αριθμός πελάτη πρέπει να έχει ακριβώς 7 ψηφία.',
  'Field already exists': 'Υπάρχει ήδη πεδίο με αυτό το όνομα σε αυτό το σύστημα.',
};

/** Μήνυμα σφάλματος για τον χρήστη, στα ελληνικά όπου γίνεται. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (KNOWN[e.message]) return KNOWN[e.message];
    if (e.status === 0) return e.message;
    if (e.status === 401) return 'Η συνεδρία έληξε. Συνδέσου ξανά.';
    if (e.status === 403) return 'Δεν έχεις δικαίωμα για αυτή την ενέργεια.';
    if (e.status === 404) return 'Δεν βρέθηκε.';
    if (e.status >= 500) return 'Σφάλμα του server. Δοκίμασε ξανά σε λίγο.';
    return e.message;
  }
  return 'Κάτι πήγε στραβά.';
}
