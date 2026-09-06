'use client';

import * as React from 'react';
import { KeyRound, CheckCircle2, XCircle, Trash2, ExternalLink, ShieldCheck } from 'lucide-react';
import { api, CLOUD_MODE, ApiError } from '@/lib/api';
import { getApiKeyState, setApiKey, clearApiKey, looksLikeKey, subscribeToApiKey, type ApiKeyState } from '@/lib/cloud/api-key';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice, SwitchRow, Panel } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

/**
 * Where a visitor supplies their own OpenAI key.
 *
 * This is the whole basis on which the hosted app can be shared: whoever
 * deployed it holds no key, so every model call is billed to the person who
 * made it. The copy says so explicitly, because "paste your API key here" is
 * exactly the request a careful person should be suspicious of, and they
 * deserve to know where it goes.
 */

/** Live key state, shared across the header badge and every panel. */
export function useApiKeyState(): ApiKeyState {
  const [state, setState] = React.useState<ApiKeyState>({ present: false, hint: '', remembered: false });

  React.useEffect(() => {
    setState(getApiKeyState());
    return subscribeToApiKey(() => setState(getApiKeyState()));
  }, []);

  return state;
}

export function ApiKeyCard({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const state = useApiKeyState();

  const [value, setValue] = React.useState('');
  const [remember, setRemember] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => setRemember(state.remembered), [state.remembered]);

  const save = () => {
    const key = value.trim();
    if (!looksLikeKey(key)) {
      toast.error('That does not look like a complete key', 'An OpenAI key is a long string with no spaces.');
      return;
    }

    setApiKey(key, remember);
    setValue('');
    setResult(null);
    toast.success('Key saved', remember ? 'Stored in this browser.' : 'Kept for this session only.');
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const outcome = await api.post<{ ok: boolean; message: string }>('/api/settings/api-key/test');
      setResult(outcome);
    } catch (error) {
      setResult({ ok: false, message: error instanceof ApiError ? error.message : 'The check could not be completed.' });
    } finally {
      setTesting(false);
    }
  };

  const remove = () => {
    clearApiKey();
    setResult(null);
    toast.success('Key removed', 'Nothing is left in this browser.');
  };

  return (
    <div className="space-y-4">
      {state.present ? (
        <Notice tone="positive" icon={<CheckCircle2 />} title="Your key is set">
          <span className="font-[family-name:var(--font-mono)]">{state.hint}</span>
          {state.remembered ? ' — remembered on this device.' : ' — kept for this browser session only.'}
        </Notice>
      ) : (
        <Notice tone="warning" icon={<KeyRound />} title="Add your OpenAI key to run for real">
          Until then everything works in demo mode: the whole product is usable, but nothing is researched and no draft is
          real.
        </Notice>
      )}

      <Field
        label={state.present ? 'Replace the key' : 'Your OpenAI API key'}
        hint="Starts with sk-. It is used only for the calls you trigger."
      >
        {({ id }) => (
          <Input
            id={id}
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && save()}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>

      <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]">
        <div className="px-3">
          <SwitchRow
            label="Remember on this device"
            hint={
              remember
                ? 'Stays until you clear it. Do not use this on a shared or public computer.'
                : 'Cleared when you close the tab. The safer choice on a computer you share.'
            }
            checked={remember}
            onCheckedChange={setRemember}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={save} disabled={!value.trim()}>
          {state.present ? 'Replace key' : 'Save key'}
        </Button>
        <Button variant="secondary" onClick={test} loading={testing} disabled={!state.present}>
          Test it
        </Button>
        {state.present && (
          <Button variant="dangerGhost" onClick={remove}>
            <Trash2 />
            Remove
          </Button>
        )}
        <Button asChild variant="ghost">
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer noopener">
            Get a key
            <ExternalLink />
          </a>
        </Button>
      </div>

      {result && (
        <Notice tone={result.ok ? 'positive' : 'negative'} icon={result.ok ? <CheckCircle2 /> : <XCircle />}>
          {result.message}
        </Notice>
      )}

      {!compact && (
        <Panel className="border-dashed bg-transparent p-4 shadow-none">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--color-signal)]" />
            <div className="space-y-2 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
              <p className="font-medium text-[var(--color-text)]">Where your key goes</p>
              <ul className="space-y-1.5">
                <li>
                  It is kept in {remember ? 'this browser' : 'this browser session'} and sent only on the requests you
                  trigger, to this app&rsquo;s own route, which forwards it to OpenAI and keeps no copy.
                </li>
                <li>
                  {CLOUD_MODE
                    ? 'Whoever deployed this app holds no key of their own and cannot see or use yours. Every call is billed to you.'
                    : 'Everything runs on this machine.'}
                </li>
                <li>It is never written into a run record, a log, or an exported workspace.</li>
                <li>Revoke it any time from your OpenAI dashboard — that works regardless of what is stored here.</li>
              </ul>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
