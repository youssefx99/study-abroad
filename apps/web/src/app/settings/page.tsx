'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { KeyRound, Save, Trash2, CheckCircle2, XCircle, Lock, Server, RefreshCw, Palette, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { api, fetcher, ApiError } from '@/lib/api';
import type { Settings, Meta, HealthReport } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, ComboInput } from '@/components/ui/field';
import { Panel, PanelHeader, Tabs, TabsList, TabsTrigger, TabsContent, Badge, Notice, SwitchRow } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock } from '@/components/shared';

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageBody><Panel><LoadingBlock /></Panel></PageBody>}>
      <SettingsContent />
    </Suspense>
  );
}

/**
 * Settings.
 *
 * The API key panel is the important one. The key is never sent back to the
 * browser after it is stored — only whether one exists, where it came from, and
 * a masked hint — so a shared screen or a screenshot cannot leak it.
 */
function SettingsContent() {
  const searchParams = useSearchParams();
  const toast = useToast();

  const { data, error, isLoading, mutate } = useSWR<Settings>('/api/settings', fetcher);
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);

  const [tab, setTab] = React.useState(searchParams.get('tab') ?? 'keys');
  const [draft, setDraft] = React.useState<Settings | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  const dirty = React.useMemo(() => {
    if (!draft || !data) return false;
    return JSON.stringify({ ...draft, apiKey: null, updatedAt: '' }) !== JSON.stringify({ ...data, apiKey: null, updatedAt: '' });
  }, [draft, data]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api.patch<Settings>('/api/settings', {
        researchModel: draft.researchModel,
        analysisModel: draft.analysisModel,
        outreachModel: draft.outreachModel,
        defaultLanguage: draft.defaultLanguage,
        defaultTone: draft.defaultTone,
        defaultWordCount: draft.defaultWordCount,
        defaultConcurrency: draft.defaultConcurrency,
        demoMode: draft.demoMode,
      });
      setDraft(saved);
      await mutate(saved, false);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <PageBody>
        <ErrorBlock error={error} onRetry={() => mutate()} />
      </PageBody>
    );
  }

  if (isLoading || !draft) {
    return (
      <PageBody>
        <Panel>
          <LoadingBlock label="Loading settings" />
        </Panel>
      </PageBody>
    );
  }

  const modelOptions = [...(meta?.models ?? []).map((m) => m.value), ...draft.customModels];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your API key, the models each stage uses, and the defaults every new run starts from."
        action={
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
            <Save />
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <PageBody>
        <Panel className="overflow-hidden">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="px-2">
              <TabsTrigger value="keys">API key</TabsTrigger>
              <TabsTrigger value="models">Models</TabsTrigger>
              <TabsTrigger value="defaults">Run defaults</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="system">System</TabsTrigger>
            </TabsList>

            <div className="p-5">
              <TabsContent value="keys">
                <ApiKeyPanel settings={draft} onChanged={() => mutate()} />
              </TabsContent>

              <TabsContent value="models" className="max-w-2xl space-y-5">
                <p className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
                  These are the defaults each stage falls back to. A prompt that names its own model overrides this, so
                  changing a value here only affects prompts that leave the model unset.
                </p>

                <Field
                  label="Research"
                  hint="Runs with web search, so it is the slowest and most expensive stage. A cheaper model is usually fine here."
                >
                  {({ id }) => (
                    <ComboInput
                      id={id}
                      listId="models-research"
                      options={modelOptions}
                      value={draft.researchModel}
                      onChange={(e) => setDraft({ ...draft, researchModel: e.target.value })}
                    />
                  )}
                </Field>

                <Field label="Analysis" hint="Short, structured reasoning. Cheap models do this well.">
                  {({ id }) => (
                    <ComboInput
                      id={id}
                      listId="models-analysis"
                      options={modelOptions}
                      value={draft.analysisModel}
                      onChange={(e) => setDraft({ ...draft, analysisModel: e.target.value })}
                    />
                  )}
                </Field>

                <Field
                  label="Outreach"
                  hint="The only stage whose output a person reads and sends. Worth the strongest model you have."
                >
                  {({ id }) => (
                    <ComboInput
                      id={id}
                      listId="models-outreach"
                      options={modelOptions}
                      value={draft.outreachModel}
                      onChange={(e) => setDraft({ ...draft, outreachModel: e.target.value })}
                    />
                  )}
                </Field>

                <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
                  <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">Suggested models</p>
                  <dl className="mt-2 space-y-1.5">
                    {(meta?.models ?? []).map((model) => (
                      <div key={model.value} className="flex gap-2 text-[0.8125rem]">
                        <dt className="w-36 shrink-0 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text)]">
                          {model.value}
                        </dt>
                        <dd className="text-[var(--color-text-muted)]">{model.hint}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-[var(--color-text-faint)]">
                    Any model your key can reach works. Type a name that is not listed and it will be used as-is.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="defaults" className="max-w-2xl space-y-5">
                <p className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
                  What the run wizard starts from. Every one can still be changed per run.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Language">
                    {({ id }) => (
                      <Select id={id} value={draft.defaultLanguage} onChange={(e) => setDraft({ ...draft, defaultLanguage: e.target.value })}>
                        {(meta?.languages ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>

                  <Field label="Tone" hint={meta?.tones.find((t) => t.value === draft.defaultTone)?.hint}>
                    {({ id }) => (
                      <Select id={id} value={draft.defaultTone} onChange={(e) => setDraft({ ...draft, defaultTone: e.target.value })}>
                        {(meta?.tones ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Message length" hint="Words.">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="number"
                        min={80}
                        max={1200}
                        step={10}
                        value={draft.defaultWordCount}
                        onChange={(e) => setDraft({ ...draft, defaultWordCount: Number(e.target.value) })}
                      />
                    )}
                  </Field>

                  <Field label="Targets at once" hint="Lower this if you hit rate limits.">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={String(draft.defaultConcurrency)}
                        onChange={(e) => setDraft({ ...draft, defaultConcurrency: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 6, 8].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <div className="border-t border-[var(--color-border)]">
                  <SwitchRow
                    label="Always use demo mode"
                    hint="Never call a model, even when a key is configured. Useful for showing the product to someone without spending anything."
                    checked={draft.demoMode}
                    onCheckedChange={(value) => setDraft({ ...draft, demoMode: value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="appearance" className="max-w-2xl">
                <ThemePicker />
              </TabsContent>

              <TabsContent value="system" className="space-y-5">
                <SystemPanel dataDir={draft.dataDir} />
              </TabsContent>
            </div>
          </Tabs>
        </Panel>
      </PageBody>
    </>
  );
}

function ApiKeyPanel({ settings, onChanged }: { settings: Settings; onChanged: () => void }) {
  const toast = useToast();
  const [value, setValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings/api-key', { apiKey: value.trim() });
      setValue('');
      setTestResult(null);
      onChanged();
      toast.success('API key saved', 'Test it below to confirm it works.');
    } catch (err) {
      toast.error('Could not save the key', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    try {
      await api.delete('/api/settings/api-key');
      setTestResult(null);
      onChanged();
      toast.success('API key cleared', 'Flow is back in demo mode.');
    } catch (err) {
      toast.error('Could not clear the key', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<{ ok: boolean; message: string }>('/api/settings/api-key/test');
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof ApiError ? err.message : 'Unexpected error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      {settings.apiKey.present ? (
        <Notice tone="positive" icon={<CheckCircle2 />} title="A key is configured">
          <span className="font-[family-name:var(--font-mono)]">{settings.apiKey.hint}</span>
          {settings.apiKey.source === 'environment' && ' — set by the environment, so it cannot be changed here.'}
        </Notice>
      ) : (
        <Notice tone="warning" icon={<KeyRound />} title="No key yet, so Flow is in demo mode">
          Every stage returns representative output instead of calling a model. The whole product works; nothing is real.
        </Notice>
      )}

      {settings.apiKey.editable ? (
        <>
          <Field
            label="OpenAI API key"
            hint="Stored on this machine in data/secrets.json, which is gitignored. It is never sent back to the browser."
          >
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={settings.apiKey.present ? 'Enter a new key to replace the current one' : 'sk-...'}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={save} loading={saving} disabled={value.trim().length < 20}>
              <Save />
              {settings.apiKey.present ? 'Replace key' : 'Save key'}
            </Button>
            <Button variant="secondary" onClick={test} loading={testing} disabled={!settings.apiKey.present}>
              Test the key
            </Button>
            {settings.apiKey.present && (
              <Button variant="dangerGhost" onClick={clear}>
                <Trash2 />
                Clear
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <Notice tone="neutral" icon={<Lock />}>
            The key comes from <code className="font-[family-name:var(--font-mono)]">OPENAI_API_KEY</code> in your
            environment. Edit your <code className="font-[family-name:var(--font-mono)]">.env</code> file to change it.
          </Notice>
          <Button variant="secondary" onClick={test} loading={testing}>
            Test the key
          </Button>
        </div>
      )}

      {testResult && (
        <Notice tone={testResult.ok ? 'positive' : 'negative'} icon={testResult.ok ? <CheckCircle2 /> : <XCircle />}>
          {testResult.message}
        </Notice>
      )}

      <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
        <h3 className="text-[0.8125rem] font-medium text-[var(--color-text)]">How the key is handled</h3>
        <ul className="mt-2 space-y-1.5 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
          <li>Written to a gitignored file on this machine, never to the browser or a third-party server.</li>
          <li>The stage services read it from disk rather than receiving it in a request, so it stays out of logs.</li>
          <li>Only a masked hint is ever returned by the API.</li>
        </ul>
      </div>
    </div>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'Match system', icon: Monitor },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Palette className="size-4 text-[var(--color-text-faint)]" />
        <h3 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">Theme</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon;
          const active = mounted && theme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                'flex items-center gap-2.5 rounded-[var(--radius-control)] border px-4 py-3 text-left transition-colors',
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]',
              )}
            >
              <Icon className="size-4" />
              <span className="text-[0.8125rem] font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
        Stored in this browser only.
      </p>
    </div>
  );
}

function SystemPanel({ dataDir }: { dataDir: string }) {
  const { data, mutate, isValidating } = useSWR<HealthReport>('/api/health', fetcher, { refreshInterval: 15_000 });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-[var(--color-text-faint)]" />
          <h3 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">Services</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => mutate()} loading={isValidating}>
          <RefreshCw />
          Check now
        </Button>
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
        Flow runs as eight independent services behind one gateway. If a stage is down, only the steps that use it fail;
        everything else keeps working.
      </p>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">Gateway</p>
            <p className="font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--color-text-faint)]">
              http://localhost:4000
            </p>
          </div>
          <Badge tone={data ? 'positive' : 'negative'}>{data ? 'ok' : 'unreachable'}</Badge>
        </div>

        {(data?.services ?? []).map((service) => (
          <div key={service.service} className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">{service.label}</p>
              <p className="truncate font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--color-text-faint)]">
                {service.url}
              </p>
              {service.error && <p className="mt-0.5 text-[0.6875rem] text-[var(--color-rose)]">{service.error}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="numeric text-[0.6875rem] text-[var(--color-text-faint)]">
                {formatDuration(service.latencyMs)}
              </span>
              <Badge tone={service.status === 'ok' ? 'positive' : service.status === 'degraded' ? 'warning' : 'negative'}>
                {service.status}
              </Badge>
            </div>
          </div>
        ))}
      </Panel>

      <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
        <h4 className="text-[0.8125rem] font-medium text-[var(--color-text)]">Where your data lives</h4>
        <p className="mt-1.5 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-muted)]">{dataDir}</p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
          Applicants, targets, prompts, pipelines, and runs are plain JSON files on this machine. Nothing is uploaded
          anywhere except the model calls you trigger yourself.
        </p>
      </div>
    </div>
  );
}
