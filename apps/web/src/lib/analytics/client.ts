import { matchAction, type ClientEventType } from './events';

/**
 * Browser side of usage analytics.
 *
 * Everything here is fire-and-forget: a blocked beacon, disabled storage, or a
 * deployment with no analytics database must never surface as an error to
 * someone drafting an email.
 */

const VISITOR_KEY = 'flow:v1:visitor';
const SESSION_KEY = 'flow:v1:session';
const OPT_OUT_KEY = 'flow:v1:analytics-off';

/** A visit ends after half an hour without activity — the convention most analytics tools share. */
const SESSION_IDLE_MS = 30 * 60_000;

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function visitorId(): string | null {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Returns the current visit, starting a new one after a long idle gap. */
function touchSession(): { id: string; isNew: boolean } | null {
  try {
    const now = Date.now();
    const stored = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? 'null') as { id: string; lastSeen: number } | null;
    const isNew = !stored || now - stored.lastSeen > SESSION_IDLE_MS;
    const id = isNew ? randomId() : stored.id;
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastSeen: now }));
    return { id, isNew };
  } catch {
    return null;
  }
}

export function isOptedOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Lets the operator keep their own browsing out of the numbers. */
export function setOptedOut(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(OPT_OUT_KEY, 'true');
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* nothing to remember without storage */
  }
}

function enabled(): boolean {
  return typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin') && !isOptedOut();
}

export function track(type: ClientEventType, fields: { name?: string; props?: Record<string, unknown> } = {}): void {
  if (!enabled()) return;

  const visitor = visitorId();
  const session = touchSession();
  if (!visitor || !session) return;

  // Only the referring site, and only on the first page of a visit: that is
  // what "where do people come from" needs, and the full URL could carry
  // someone else's query string.
  let referrer: string | undefined;
  if (type === 'page_view' && session.isNew && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) referrer = host;
    } catch {
      /* an unparseable referrer is no referrer */
    }
  }

  const body = JSON.stringify({ type, visitorId: visitor, sessionId: session.id, referrer, ...fields });

  try {
    if (navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/track', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(
      () => undefined,
    );
  } catch {
    /* analytics is never worth an error */
  }
}

/** Counts a successful mutation, if it is one the admin screen reports on. */
export function trackAction(method: string, path: string): void {
  const key = matchAction(method, path);
  if (key) track('action', { name: key });
}

/**
 * Identifies the visitor on a model call, so the server can attribute the
 * tokens it measures. Ids only — nothing about the person.
 */
export function analyticsHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  if (isOptedOut()) return { 'x-flow-analytics': 'off' };
  const visitor = visitorId();
  const session = touchSession();
  if (!visitor || !session) return {};
  return { 'x-flow-visitor': visitor, 'x-flow-session': session.id };
}
