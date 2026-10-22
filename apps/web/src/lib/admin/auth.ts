import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSql } from '@/lib/analytics/db';

/**
 * Admin access.
 *
 * One operator account, defined entirely by two environment variables:
 * `ADMIN_USERNAME` and `ADMIN_PASSWORD`. With either missing, nobody can sign
 * in — there is no default password to forget to change.
 *
 * The session is a signed, expiring cookie. The signing key is derived from
 * the credentials themselves, so changing the password signs every existing
 * session out without a separate secret to manage.
 */

export const SESSION_COOKIE = 'flow_admin';
export const SESSION_HOURS = 12;

const MAX_FAILURES = 8;
const FAILURE_WINDOW = '15 minutes';

interface Credentials {
  username: string;
  password: string;
}

function credentials(): Credentials | null {
  const username = process.env.ADMIN_USERNAME?.trim() ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  return username && password ? { username, password } : null;
}

export function isAdminConfigured(): boolean {
  return credentials() !== null;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time, and length-independent because both sides are hashed first. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function sign(payload: string, creds: Credentials): string {
  const key = digest(`flow-admin-session\n${creds.username}\n${creds.password}`);
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function checkCredentials(username: string, password: string): boolean {
  const creds = credentials();
  if (!creds) return false;

  // Both compared every time, so the response time does not reveal which half was wrong.
  const userOk = safeEqual(username.trim(), creds.username);
  const passOk = safeEqual(password, creds.password);
  return userOk && passOk;
}

export function createSessionToken(): string {
  const creds = credentials();
  if (!creds) throw new Error('Admin credentials are not configured.');

  const payload = String(Date.now() + SESSION_HOURS * 3_600_000);
  return `${payload}.${sign(payload, creds)}`;
}

function verifySessionToken(token: string): boolean {
  const creds = credentials();
  if (!creds) return false;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  if (!(Number(payload) > Date.now())) return false;

  return safeEqual(signature, sign(payload, creds));
}

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : false;
}

/** Every admin page and action starts here. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}

/* ------------------------------------------------------- attempt limiting */

/**
 * The caller's address, hashed. Enough to count failed attempts from one
 * place; useless for anything else, since the raw IP is never stored.
 */
export async function attemptKey(): Promise<string> {
  const list = await headers();
  const ip = list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`flow-admin-ip\n${ip}`).digest('hex').slice(0, 32);
}

/**
 * Limiting needs somewhere to count, so it uses the analytics database when
 * one is connected. Without one, the fixed delay on every failure is what
 * slows a guessing script down.
 */
export async function tooManyAttempts(key: string): Promise<boolean> {
  try {
    const sql = await getSql();
    if (!sql) return false;
    const rows = await sql`
      SELECT COUNT(*)::int AS failures FROM flow_admin_logins
      WHERE ip_hash = ${key} AND ok = false AND at > now() - ${FAILURE_WINDOW}::interval`;
    return Number(rows[0]?.failures ?? 0) >= MAX_FAILURES;
  } catch {
    return false;
  }
}

export async function recordAttempt(key: string, ok: boolean): Promise<void> {
  try {
    const sql = await getSql();
    if (!sql) return;
    await sql`INSERT INTO flow_admin_logins (ip_hash, ok) VALUES (${key}, ${ok})`;
    // A successful sign-in clears the slate for that address.
    if (ok) await sql`DELETE FROM flow_admin_logins WHERE ip_hash = ${key} AND ok = false`;
  } catch {
    /* limiting is best-effort; it must never block a correct password */
  }
}
