'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Save,
  History,
  RotateCcw,
  Copy,
  Trash2,
  Play,
  AlertTriangle,
  CheckCircle2,
  Braces,
  Variable,
} from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { Prompt, Meta, ModelConfig, ProfileSummary, Target } from '@/lib/types';
import { cn, formatDateTime, formatNumber, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select, ComboInput } from '@/components/ui/field';
import {
  Panel,
  PanelHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Badge,
  Notice,
  SwitchRow,
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
  DialogClose,
  Tooltip,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock, CopyButton } from '@/components/shared';

/**
 * Prompt studio.
 *
 * The editing model is deliberate: edits are held locally, then *published* as
 * a new version. A prompt that produced a run must stay readable exactly as it
 * was, or the results it produced become unexplainable. Rolling back is one
 * click, and built-ins can always be restored to what they shipped as.
 */
export default function PromptStudioPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const router = useRouter();
  const toast = useToast();

  const { data: prompt, error, isLoading, mutate } = useSWR<Prompt>(`/api/prompts/${key}`, fetcher);
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);

  const [systemPrompt, setSystemPrompt] = React.useState('');
  const [userPrompt, setUserPrompt] = React.useState('');
  const [config, setConfig] = React.useState<ModelConfig | null>(null);
  const [schemaText, setSchemaText] = React.useState('');
  const [publishing, setPublishing] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [tab, setTab] = React.useState('prompt');

  // Reset the working copy whenever the active version changes underneath us.
  React.useEffect(() => {
    if (!prompt) return;
    setSystemPrompt(prompt.active.systemPrompt);
    setUserPrompt(prompt.active.userPrompt);
    setConfig(prompt.active.config);
    setSchemaText(prompt.active.outputSchema ? JSON.stringify(prompt.active.outputSchema, null, 2) : '');
  }, [prompt?.id, prompt?.activeVersion]);

  const schemaParse = React.useMemo(() => {
    if (!schemaText.trim()) return { value: null as Record<string, unknown> | null, error: '' };
    try {
      return { value: JSON.parse(schemaText) as Record<string, unknown>, error: '' };
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  }, [schemaText]);

  const detectedVariables = React.useMemo(() => {
    const found: string[] = [];
    for (const source of [systemPrompt, userPrompt]) {
      for (const match of source.matchAll(/\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}/g)) {
        if (!found.includes(match[1])) found.push(match[1]);
      }
    }
    return found;
  }, [systemPrompt, userPrompt]);

  const dirty = React.useMemo(() => {
    if (!prompt || !config) return false;
    const currentSchema = prompt.active.outputSchema ? JSON.stringify(prompt.active.outputSchema, null, 2) : '';
    return (
      systemPrompt !== prompt.active.systemPrompt ||
      userPrompt !== prompt.active.userPrompt ||
      schemaText !== currentSchema ||
      JSON.stringify(config) !== JSON.stringify(prompt.active.config)
    );
  }, [prompt, systemPrompt, userPrompt, schemaText, config]);

  const publish = async () => {
    if (!prompt || !config) return;
    if (schemaText.trim() && schemaParse.error) {
      toast.error('The output schema is not valid JSON', schemaParse.error);
      return;
    }

    setPublishing(true);
    try {
      const updated = await api.post<Prompt>(`/api/prompts/${prompt.key}/versions`, {
        note: note.trim() || undefined,
        systemPrompt,
        userPrompt,
        config,
        outputSchema: schemaParse.value,
      });
      await mutate(updated, false);
      setPublishOpen(false);
      setNote('');
      toast.success(`Published version ${updated.activeVersion}`, 'The next run will use it.');
    } catch (err) {
      toast.error('Could not publish', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setPublishing(false);
    }
  };

  const activate = async (version: number) => {
    if (!prompt) return;
    try {
      const updated = await api.post<Prompt>(`/api/prompts/${prompt.key}/activate/${version}`);
      await mutate(updated, false);
      toast.success(`Now using version ${version}`);
    } catch (err) {
      toast.error('Could not switch version', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const restore = async () => {
    if (!prompt) return;
    try {
      const updated = await api.post<Prompt>(`/api/prompts/${prompt.key}/restore`);
      await mutate(updated, false);
      toast.success('Original restored', 'Published as a new version, so your edits are still in the history.');
    } catch (err) {
      toast.error('Could not restore', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const duplicate = async () => {
    if (!prompt) return;
    try {
      const copy = await api.post<Prompt>(`/api/prompts/${prompt.key}/duplicate`);
      toast.success('Duplicated', 'Editing the copy.');
      router.push(`/prompts/${copy.key}`);
    } catch (err) {
      toast.error('Could not duplicate', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const remove = async () => {
    if (!prompt) return;
    try {
      await api.delete(`/api/prompts/${prompt.key}`);
      toast.success('Deleted', prompt.name);
      router.push('/prompts');
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  if (error) {
    return (
      <PageBody>
        <ErrorBlock error={error} onRetry={() => mutate()} />
      </PageBody>
    );
  }

  if (isLoading || !prompt || !config) {
    return (
      <PageBody>
        <Panel>
          <LoadingBlock label="Loading prompt" />
        </Panel>
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/prompts', label: 'Prompts' },
          { href: `/prompts/${prompt.key}`, label: prompt.name },
        ]}
        eyebrow={prompt.key}
        title={prompt.name}
        description={prompt.description}
        action={
          <>
            <Button variant="ghost" onClick={duplicate}>
              <Copy />
              Duplicate
            </Button>
            {prompt.isBuiltIn ? (
              <Tooltip label="Publishes the text this prompt shipped with as a new version. Your edits stay in the history.">
                <Button variant="ghost" onClick={restore}>
                  <RotateCcw />
                  Restore original
                </Button>
              </Tooltip>
            ) : (
              <Button variant="dangerGhost" onClick={remove}>
                <Trash2 />
                Delete
              </Button>
            )}
            <Button variant="primary" onClick={() => setPublishOpen(true)} disabled={!dirty}>
              <Save />
              {dirty ? 'Publish version' : 'No changes'}
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel className="overflow-hidden">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="px-2">
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="model">Model</TabsTrigger>
                <TabsTrigger value="schema">Output schema</TabsTrigger>
                <TabsTrigger value="test">Test</TabsTrigger>
                <TabsTrigger value="versions">Versions ({prompt.versions.length})</TabsTrigger>
              </TabsList>

              <div className="p-5">
                <TabsContent value="prompt" className="space-y-5">
                  <Field
                    label="System prompt"
                    hint="Sets the role and the rules. Kept separate so the task text below stays readable."
                    aside={`${formatNumber(systemPrompt.length)} characters`}
                  >
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={12}
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        className="font-[family-name:var(--font-mono)] text-xs leading-relaxed"
                      />
                    )}
                  </Field>

                  <Field
                    label="User prompt"
                    hint="The task itself. Use {{double braces}} to insert applicant, target, and earlier step data."
                    aside={`${formatNumber(userPrompt.length)} characters`}
                  >
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={18}
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        className="font-[family-name:var(--font-mono)] text-xs leading-relaxed"
                      />
                    )}
                  </Field>
                </TabsContent>

                <TabsContent value="model" className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Model" hint="Any model your key can reach.">
                      {({ id }) => (
                        <ComboInput
                          id={id}
                          listId="model-options"
                          options={(meta?.models ?? []).map((m) => m.value)}
                          value={config.model}
                          onChange={(e) => setConfig({ ...config, model: e.target.value })}
                        />
                      )}
                    </Field>

                    <Field
                      label="Temperature"
                      hint="Leave empty for reasoning models, which reject it."
                    >
                      {({ id }) => (
                        <Input
                          id={id}
                          type="number"
                          min={0}
                          max={2}
                          step={0.1}
                          value={config.temperature ?? ''}
                          onChange={(e) =>
                            setConfig({ ...config, temperature: e.target.value === '' ? null : Number(e.target.value) })
                          }
                          placeholder="not sent"
                        />
                      )}
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Reasoning effort" hint="Only applies to reasoning models. Higher costs more.">
                      {({ id }) => (
                        <Select
                          id={id}
                          value={config.reasoningEffort ?? ''}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              reasoningEffort: (e.target.value || null) as ModelConfig['reasoningEffort'],
                            })
                          }
                        >
                          <option value="">Not set</option>
                          {(meta?.reasoningEfforts ?? []).map((effort) => (
                            <option key={effort} value={effort}>
                              {effort}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Field label="Max output tokens" hint="Empty means the model default.">
                      {({ id }) => (
                        <Input
                          id={id}
                          type="number"
                          min={64}
                          value={config.maxOutputTokens ?? ''}
                          onChange={(e) =>
                            setConfig({ ...config, maxOutputTokens: e.target.value === '' ? null : Number(e.target.value) })
                          }
                          placeholder="model default"
                        />
                      )}
                    </Field>
                  </div>

                  <div className="border-t border-[var(--color-border)] pt-1">
                    <SwitchRow
                      label="Use web search"
                      hint="Lets the model browse. Necessary for research steps, and considerably slower and more expensive."
                      checked={config.webSearch}
                      onCheckedChange={(value) => setConfig({ ...config, webSearch: value })}
                    />
                  </div>

                  {config.webSearch && config.temperature !== null && (
                    <Notice tone="warning" icon={<AlertTriangle />}>
                      Some search-enabled models reject an explicit temperature. If a run fails with a temperature error,
                      clear the field above.
                    </Notice>
                  )}
                </TabsContent>

                <TabsContent value="schema" className="space-y-4">
                  <Notice tone="neutral" icon={<Braces />}>
                    A JSON schema forces the model to return exactly these fields, which is what lets later steps read the
                    output reliably. Strict mode requires every property to be listed in{' '}
                    <code className="font-[family-name:var(--font-mono)]">required</code> and{' '}
                    <code className="font-[family-name:var(--font-mono)]">additionalProperties</code> set to false.
                  </Notice>

                  {schemaParse.error && <Notice tone="negative" title="Not valid JSON">{schemaParse.error}</Notice>}

                  {prompt.schemaIssues.length > 0 && !dirty && (
                    <Notice tone="warning" title="The published schema has problems">
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {prompt.schemaIssues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </Notice>
                  )}

                  <Field label="Schema" hint="Leave empty to let the model return free text instead.">
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={22}
                        value={schemaText}
                        onChange={(e) => setSchemaText(e.target.value)}
                        placeholder='{\n  "type": "object",\n  "properties": { "answer": { "type": "string" } },\n  "required": ["answer"],\n  "additionalProperties": false\n}'
                        className="font-[family-name:var(--font-mono)] text-xs leading-relaxed"
                      />
                    )}
                  </Field>
                </TabsContent>

                <TabsContent value="test">
                  <RenderTester
                    promptKey={prompt.key}
                    systemPrompt={systemPrompt}
                    userPrompt={userPrompt}
                    detectedVariables={detectedVariables}
                  />
                </TabsContent>

                <TabsContent value="versions" className="space-y-3">
                  {dirty && (
                    <Notice tone="warning">
                      You have unpublished edits. Switching version will discard them.
                    </Notice>
                  )}

                  {[...prompt.versions].reverse().map((version) => {
                    const active = version.version === prompt.activeVersion;

                    return (
                      <div
                        key={version.version}
                        className={cn(
                          'rounded-[var(--radius-control)] border px-4 py-3',
                          active
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface-sunken)]',
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[0.875rem] font-medium text-[var(--color-text)]">
                                Version {version.version}
                              </span>
                              {active && (
                                <Badge tone="accent">
                                  <CheckCircle2 className="size-2.5" />
                                  In use
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-[0.8125rem] text-[var(--color-text-muted)]">{version.note}</p>
                            <p className="mt-1 text-[0.6875rem] text-[var(--color-text-faint)]">
                              {formatDateTime(version.createdAt)} · {version.config.model}
                              {version.config.webSearch && ' · web search'}
                            </p>
                          </div>

                          {!active && (
                            <Button variant="secondary" size="sm" onClick={() => activate(version.version)}>
                              <History />
                              Use this
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>
              </div>
            </Tabs>
          </Panel>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Panel>
              <PanelHeader title="Variables in use" description="Read from the run context at render time." />
              <div className="px-4 py-3">
                {detectedVariables.length === 0 ? (
                  <p className="text-[0.8125rem] text-[var(--color-text-faint)]">
                    None yet. Insert one below to personalise this prompt.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detectedVariables.map((variable) => (
                      <Badge key={variable} tone="neutral" className="font-[family-name:var(--font-mono)]">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--color-border)] px-4 py-3">
                <p className="mb-2 text-[0.6875rem] font-medium text-[var(--color-text-faint)]">Available to insert</p>
                <div className="space-y-2.5">
                  {VARIABLE_GUIDE.map((group) => (
                    <div key={group.label}>
                      <p className="text-[0.6875rem] text-[var(--color-text-muted)]">{group.label}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {group.items.map((item) => (
                          <Tooltip key={item.name} label={item.hint}>
                            <button
                              type="button"
                              onClick={() => setUserPrompt((current) => `${current}{{${item.name}}}`)}
                              className="rounded-[var(--radius-chip)] border border-[var(--color-border)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                            >
                              {item.name}
                            </button>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Current settings" />
              <dl className="space-y-2 px-4 py-3 text-[0.8125rem]">
                <Row label="Model" value={config.model} mono />
                <Row label="Temperature" value={config.temperature === null ? 'not sent' : String(config.temperature)} mono />
                <Row label="Reasoning" value={config.reasoningEffort ?? 'not set'} mono />
                <Row label="Web search" value={config.webSearch ? 'on' : 'off'} mono />
                <Row label="Output" value={schemaParse.value ? 'structured JSON' : 'free text'} />
                <Row label="Last edited" value={timeAgo(prompt.updatedAt)} />
              </dl>
            </Panel>
          </aside>
        </div>
      </PageBody>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent
          title="Publish a new version"
          description="The current version is kept, so you can go back at any time."
        >
          <DialogBody>
            <Field label="What changed?" hint="A short note makes the version history worth reading later.">
              {({ id }) => (
                <Input
                  id={id}
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && publish()}
                  placeholder="e.g. Ask for a specific paper rather than a general one"
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" onClick={publish} loading={publishing}>
              Publish version {Math.max(...prompt.versions.map((v) => v.version)) + 1}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className={cn('truncate text-[var(--color-text)]', mono && 'font-[family-name:var(--font-mono)] text-xs')}>{value}</dd>
    </div>
  );
}

const VARIABLE_GUIDE = [
  {
    label: 'Applicant',
    items: [
      { name: 'applicant.block', hint: 'The whole profile as formatted text. What most prompts want.' },
      { name: 'applicant.fullName', hint: 'Their name.' },
      { name: 'applicant.targetDegree', hint: 'What they are applying for.' },
      { name: 'applicant.targetIntake', hint: 'The intended start term.' },
      { name: 'applicant.researchInterests', hint: 'Comma-separated interests.' },
      { name: 'applicant.researchStatement', hint: 'Their statement in full.' },
      { name: 'applicant.nationality', hint: 'Used where visa or eligibility matters.' },
    ],
  },
  {
    label: 'Target',
    items: [
      { name: 'target.block', hint: 'The whole target as formatted text.' },
      { name: 'target.name', hint: 'Who or what they are writing to.' },
      { name: 'target.organization', hint: 'University, company, or funding body.' },
      { name: 'target.country', hint: 'Where the target is.' },
      { name: 'target.focusAreas', hint: 'Comma-separated focus areas.' },
      { name: 'target.notes', hint: 'Whatever the applicant already knew.' },
    ],
  },
  {
    label: 'Earlier steps',
    items: [
      { name: 'steps.research', hint: 'Output of the step whose key is "research".' },
      { name: 'steps.analysis', hint: 'Output of the step whose key is "analysis".' },
      { name: 'steps.draft.body', hint: 'One field from an earlier step, by path.' },
    ],
  },
  {
    label: 'Run options',
    items: [
      { name: 'options.language', hint: 'Language chosen for this run.' },
      { name: 'options.tone', hint: 'Formal, professional, warm, or direct.' },
      { name: 'options.wordCount', hint: 'Target length.' },
      { name: 'options.extraInstructions', hint: 'Anything typed for this run only.' },
      { name: 'today', hint: "Today's date, so the model knows what recent means." },
    ],
  },
];

/**
 * Renders the prompt against real records without calling a model.
 *
 * This is the cheapest possible way to find out that a variable is misspelled,
 * and it costs nothing to run. Sending forty emails before noticing that
 * `{{applicant.statement}}` should have been `{{applicant.researchStatement}}`
 * is the failure this prevents.
 */
function RenderTester({
  promptKey,
  systemPrompt,
  userPrompt,
  detectedVariables,
}: {
  promptKey: string;
  systemPrompt: string;
  userPrompt: string;
  detectedVariables: string[];
}) {
  const { data: profiles } = useSWR<ProfileSummary[]>('/api/profiles', fetcher);
  const { data: targets } = useSWR<Target[]>('/api/targets', fetcher);

  const [profileId, setProfileId] = React.useState('');
  const [targetId, setTargetId] = React.useState('');
  const [result, setResult] = React.useState<{
    systemPrompt: string;
    userPrompt: string;
    missingVariables: string[];
    approximateTokens: number;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();

  React.useEffect(() => {
    if (!profileId && profiles?.length) setProfileId(profiles[0].id);
  }, [profiles, profileId]);

  React.useEffect(() => {
    if (!targetId && targets?.length) setTargetId(targets[0].id);
  }, [targets, targetId]);

  const run = async () => {
    setBusy(true);
    try {
      const [profile, target] = await Promise.all([
        profileId ? api.get<Record<string, unknown>>(`/api/profiles/${profileId}`) : Promise.resolve(null),
        targetId ? api.get<Record<string, unknown>>(`/api/targets/${targetId}`) : Promise.resolve(null),
      ]);

      const context = {
        today: new Date().toISOString().slice(0, 10),
        applicant: profile
          ? {
              ...profile,
              block: profile.promptBlock,
              name: profile.fullName,
              researchInterests: (profile.researchInterests as string[])?.join(', '),
            }
          : {},
        target: target
          ? { ...target, block: target.promptBlock, focusAreas: (target.focusAreas as string[])?.join(', ') }
          : {},
        options: { language: 'en', tone: 'professional', wordCount: 260, extraInstructions: '' },
        steps: {
          research: '[output of the research step would appear here]',
          analysis: '[output of the analysis step would appear here]',
          draft: { subject: '[draft subject]', body: '[draft body]', claims_used: [] },
        },
      };

      const rendered = await api.post<typeof result>(`/api/prompts/${promptKey}/render`, {
        context,
        overrides: { systemPrompt, userPrompt },
      });
      setResult(rendered);
    } catch (err) {
      toast.error('Could not render', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Notice tone="accent" icon={<Variable />}>
        Renders your unsaved edits against real records so you can see the exact text that would be sent. No model is
        called and nothing is charged.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field label="Applicant">
          {({ id }) => (
            <Select id={id} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">None</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Target">
          {({ id }) => (
            <Select id={id} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">None</option>
              {(targets ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Button variant="primary" onClick={run} loading={busy}>
          <Play />
          Render
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          {result.missingVariables.length > 0 ? (
            <Notice tone="warning" icon={<AlertTriangle />} title="Some variables resolved to nothing">
              <p>
                <code className="font-[family-name:var(--font-mono)]">{result.missingVariables.join(', ')}</code>
              </p>
              <p className="mt-1">
                Either the path is misspelled, or the record has nothing in that field. Check the variable list on the
                right for the correct names.
              </p>
            </Notice>
          ) : (
            <Notice tone="positive" icon={<CheckCircle2 />}>
              Every variable resolved. Roughly {formatNumber(result.approximateTokens)} tokens per call.
            </Notice>
          )}

          {detectedVariables.length > 0 && (
            <p className="text-xs text-[var(--color-text-faint)]">
              {detectedVariables.length} variable{detectedVariables.length === 1 ? '' : 's'} referenced,{' '}
              {detectedVariables.length - result.missingVariables.length} resolved.
            </p>
          )}

          {result.systemPrompt && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-[0.8125rem] font-medium text-[var(--color-text)]">System prompt as sent</h4>
                <CopyButton value={result.systemPrompt} />
              </div>
              <pre className="scroll-x max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3.5 font-[family-name:var(--font-mono)] text-xs leading-relaxed">
                {result.systemPrompt}
              </pre>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[0.8125rem] font-medium text-[var(--color-text)]">User prompt as sent</h4>
              <CopyButton value={result.userPrompt} />
            </div>
            <pre className="scroll-x max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3.5 font-[family-name:var(--font-mono)] text-xs leading-relaxed">
              {result.userPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
