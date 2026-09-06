/**
 * The visitor's own OpenAI key.
 *
 * Rules this module exists to enforce:
 *
 * 1. The key is entered by the person using the app. The deployment never
 *    holds one, and the server never reads `OPENAI_API_KEY` for a model call.
 * 2. It is kept in this browser and sent only on the request that needs it,
 *    to this app's own `/api/execute` route, which forwards it to OpenAI and
 *    keeps no copy.
 * 3. "Remember on this device" is a deliberate choice, defaulting to off.
 *    On a shared or library computer, session storage means closing the tab
 *    ends it.
 *
 * The key is never written to a run record, a log, or an exported workspace.
 */

const STORAGE_KEY = 'flow:v1:openai-key';
const REMEMBER_KEY = 'flow:v1:openai-key-remember';

export interface ApiKeyState {
  present: boolean;
  hint: string;
  remembered: boolean;
}

/** Proves which key is stored without showing it. */
export function maskKey(key: string): string {
  const value = String(key ?? '').trim();
  if (value.length < 12) return '••••';
  return `${value.slice(0, 6)}••••${value.slice(-4)}`;
}

function storageFor(remember: boolean): Storage | null {
  if (typeof window === 'undefined') return null;
  return remember ? window.localStorage : window.sessionStorage;
}

/** @returns the raw key, or an empty string. Never render this. */
export function getApiKey(): string {
  if (typeof window === 'undefined') return '';

  try {
    // Session first: a key set for this session only should win over a stale
    // remembered one, so "use a different key just this once" behaves.
    return (
      window.sessionStorage.getItem(STORAGE_KEY)?.trim() ||
      window.localStorage.getItem(STORAGE_KEY)?.trim() ||
      ''
    );
  } catch {
    return '';
  }
}

export function getApiKeyState(): ApiKeyState {
  const key = getApiKey();
  let remembered = false;

  try {
    remembered = typeof window !== 'undefined' && window.localStorage.getItem(REMEMBER_KEY) === 'true';
  } catch {
    remembered = false;
  }

  return { present: Boolean(key), hint: key ? maskKey(key) : '', remembered };
}

export function setApiKey(key: string, remember: boolean): ApiKeyState {
  const value = key.trim();

  // Clear both stores first, so switching "remember" off does not leave the
  // previous key sitting in localStorage.
  clearApiKey();

  const store = storageFor(remember);
  if (store && value) {
    store.setItem(STORAGE_KEY, value);
    if (remember) window.localStorage.setItem(REMEMBER_KEY, 'true');
  }

  notify();
  return getApiKeyState();
}

export function clearApiKey(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* a browser with storage disabled has nothing to clear */
  }

  notify();
}

/**
 * A cheap shape check, run before spending a request to find out the key is a
 * typo. Deliberately loose: OpenAI has shipped several key formats and a
 * strict pattern would reject valid new ones.
 */
export function looksLikeKey(key: string): boolean {
  const value = key.trim();
  return value.length >= 20 && !/\s/.test(value);
}

/* Subscription, so the header badge and the settings tab agree without
   polling and without a global state library. */

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToApiKey(listener: Listener): () => void {
  listeners.add(listener);

  // Another tab changing the key should update this one.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === REMEMBER_KEY) listener();
  };

  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
