'use client';

import * as React from 'react';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { signIn, type SignInState } from '../actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice, Panel } from '@/components/ui/primitives';
import { AdminMark } from '../_components/parts';

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = React.useActionState<SignInState, FormData>(signIn, {});

  return (
    <Panel className="w-full max-w-sm">
      <div className="space-y-4 border-b border-[var(--color-border)] px-6 pb-5 pt-6">
        <AdminMark />
        <div className="space-y-1">
          <h1 className="text-[1.25rem] leading-tight text-[var(--color-text)]">Sign in</h1>
          <p className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
            The admin area shows how people use Flow: users, visits, runs, and tokens.
          </p>
        </div>
      </div>

      <form action={action} className="space-y-4 px-6 py-5">
        {!configured && (
          <Notice tone="warning" icon={<AlertTriangle />} title="Admin access is not set up">
            Add <code className="font-[family-name:var(--font-mono)]">ADMIN_USERNAME</code> and{' '}
            <code className="font-[family-name:var(--font-mono)]">ADMIN_PASSWORD</code> under Vercel → Settings → Environment
            Variables, then redeploy.
          </Notice>
        )}

        {state.error && configured && (
          <Notice tone="negative" icon={<AlertTriangle />}>
            {state.error}
          </Notice>
        )}

        <Field label="Username">
          {({ id }) => (
            <Input id={id} name="username" defaultValue={state.username} autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={!configured} />
          )}
        </Field>

        <Field label="Password">
          {({ id }) => <Input id={id} name="password" type="password" autoComplete="current-password" required disabled={!configured} />}
        </Field>

        <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={!configured}>
          <LockKeyhole />
          Sign in
        </Button>
      </form>
    </Panel>
  );
}
