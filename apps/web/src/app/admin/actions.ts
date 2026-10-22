'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  SESSION_HOURS,
  attemptKey,
  checkCredentials,
  createSessionToken,
  isAdminConfigured,
  recordAttempt,
  tooManyAttempts,
} from '@/lib/admin/auth';

export interface SignInState {
  error?: string;
  /** Returned so a failed attempt does not make the person retype it. */
  username?: string;
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  if (!isAdminConfigured()) {
    return { error: 'Admin access is not set up yet. Add ADMIN_USERNAME and ADMIN_PASSWORD to the environment, then redeploy.' };
  }

  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!username || !password) return { error: 'Enter both the username and the password.', username };

  const key = await attemptKey();
  if (await tooManyAttempts(key)) {
    return { error: 'Too many failed attempts from this network. Wait 15 minutes, then try again.', username };
  }

  const ok = checkCredentials(username, password);
  await recordAttempt(key, ok);

  if (!ok) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    return { error: 'That username and password do not match.', username };
  }

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: SESSION_HOURS * 3600,
  });

  redirect('/admin');
}

export async function signOut(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', { path: '/admin', maxAge: 0 });
  redirect('/admin/login');
}
