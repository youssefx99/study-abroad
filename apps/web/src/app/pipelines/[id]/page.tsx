'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Save, Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Globe, Trash } from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { Pipeline, PipelineStep, PromptSummary, Meta } from '@/lib/types';
import { cn, localId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select } from '@/components/ui/field';
import { Panel, PanelHeader, Badge, Notice, SwitchRow, Tooltip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock } from '@/components/shared';

/**
 * Pipeline builder.
 *
 * Reordering is done with explicit up and down buttons rather than drag and
 * drop. Drag needs a pointer, a steady hand, and does not work with a keyboard
 * or a screen reader without a lot of extra code — and this list is four items
 * long. Buttons are simply better here.
 */
export default function PipelineBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();

  const { data, error, isLoading, mutate } = useSWR<Pipeline>(`/api/pipelines/${id}`, fetcher);
  const { data: prompts } = useSWR<PromptSummary[]>('/api/prompts', fetcher);
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);

  const [draft, setDraft] = React.useState<Pipeline | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  const dirty = React.useMemo(() => {
    if (!draft || !data) return false;
    return JSON.stringify({ ...draft, updatedAt: '', issues: [] }) !== JSON.stringify({ ...data, updatedAt: '', issues: [] });
  }, [draft, data]);

  const setSteps = (steps: PipelineStep[]) => {
    setDraft((current) => (current ? { ...current, steps } : current));
  };

  const updateStep = (stepId: string, patch: Partial<PipelineStep>) => {
    if (!draft) return;
    setSteps(draft.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)));
  };

  const move = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const next = [...draft.steps];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };

  const addStep = () => {
    if (!draft) return;
    const fallback = prompts?.[0];
    // Keys must be unique because they name the slot later steps read from.
    const used = new Set(draft.steps.map((s) => s.key));
    let key = 'step';
    let n = 2;
    while (used.has(key)) {
      key = `step${n}`;
      n += 1;
    }

    setSteps([
      ...draft.steps,
      {
        id: localId('stp'),
        key,
        title: fallback?.name ?? 'New step',
        description: '',
        promptKey: fallback?.key ?? '',
        service: meta?.stages.find((s) => s.value === fallback?.stage)?.service ?? 'analysis',
        enabled: true,
        optional: false,
      },
    ]);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api.patch<Pipeline>(`/api/pipelines/${id}`, {
        name: draft.name,
        description: draft.description,
        steps: draft.steps.map(({ prompt: _prompt, ...step }) => step),
        tags: draft.tags,
      });
      // Refetch rather than adopting the PATCH response: only the GET resolves
      // each step's prompt, which the badges read. Assigning the refreshed copy
      // directly — instead of clearing the draft and letting the loading gate
      // repopulate it — keeps the editor mounted, so saving no longer blanks
      // the page to a spinner.
      const refreshed = await mutate();
      if (refreshed) setDraft(refreshed);
      toast.success('Pipeline saved', saved.name);
    } catch (err) {
      toast.error(
        'Could not save',
        err instanceof ApiError
          ? err.issues.length
            ? err.issues.map((i) => `${i.field}: ${i.message}`).join('; ')
            : err.message
          : 'Unexpected error',
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/api/pipelines/${id}`);
      toast.success('Pipeline deleted');
      router.push('/pipelines');
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

  if (isLoading || !draft) {
    return (
      <PageBody>
        <Panel>
          <LoadingBlock label="Loading pipeline" />
        </Panel>
      </PageBody>
    );
  }

  const duplicateKeys = draft.steps
    .map((s) => s.key)
    .filter((key, index, all) => all.indexOf(key) !== index);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/pipelines', label: 'Pipelines' },
          { href: `/pipelines/${id}`, label: draft.name },
        ]}
        title={draft.name}
        description={draft.description || 'No description yet.'}
        action={
          <>
            {!draft.isBuiltIn && (
              <Button variant="dangerGhost" onClick={remove}>
                <Trash />
                Delete
              </Button>
            )}
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
              <Save />
              {dirty ? 'Save pipeline' : 'Saved'}
            </Button>
          </>
        }
      />

      {/* A fieldset natively disables every descendant control, which closes
          the window where an edit made mid-save would be silently discarded by
          the refreshed copy landing on top of it. */}
      <fieldset disabled={saving} className="contents">
      <PageBody className="space-y-5">
        {duplicateKeys.length > 0 && (
          <Notice tone="negative" icon={<AlertTriangle />} title="Two steps share an output key">
            <code className="font-[family-name:var(--font-mono)]">{[...new Set(duplicateKeys)].join(', ')}</code>. Later
            steps read earlier output by key, so each one must be unique or the second will silently overwrite the first.
          </Notice>
        )}

        <Panel>
          <PanelHeader title="Details" />
          <div className="space-y-4 px-5 py-4">
            <Field label="Name" required>
              {({ id: fid }) => (
                <Input id={fid} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              )}
            </Field>
            <Field label="Description" hint="What this pipeline is for, and when to reach for it instead of another.">
              {({ id: fid }) => (
                <Textarea
                  id={fid}
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              )}
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Steps"
            description="They run top to bottom. Each one can read the output of every step above it."
            action={
              <Button variant="secondary" size="sm" onClick={addStep}>
                <Plus />
                Add step
              </Button>
            }
          />

          <div className="space-y-4 px-5 py-4">
            {draft.steps.map((step, index) => {
              const prompt = prompts?.find((p) => p.key === step.promptKey);
              const missing = step.promptKey && !prompt;

              return (
                <div
                  key={step.id}
                  className={cn(
                    'rounded-[var(--radius-panel)] border bg-[var(--color-surface-sunken)] p-4',
                    missing ? 'border-[var(--color-rose)]' : 'border-[var(--color-border)]',
                    !step.enabled && 'opacity-70',
                  )}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] font-[family-name:var(--font-mono)] text-[0.6875rem] font-medium text-[var(--color-accent)]">
                      {index + 1}
                    </span>

                    <span className="flex-1 text-[0.875rem] font-medium text-[var(--color-text)]">{step.title}</span>

                    {prompt?.webSearch && (
                      <Tooltip label="This step uses web search: slower and more expensive.">
                        <Badge tone="accent">
                          <Globe className="size-2.5" />
                          Web
                        </Badge>
                      </Tooltip>
                    )}

                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move step up"
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => move(index, 1)}
                      disabled={index === draft.steps.length - 1}
                      aria-label="Move step down"
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      variant="dangerGhost"
                      size="iconSm"
                      onClick={() => setSteps(draft.steps.filter((s) => s.id !== step.id))}
                      disabled={draft.steps.length === 1}
                      aria-label="Remove step"
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {missing && (
                    <Notice tone="negative" className="mb-3">
                      The prompt <code className="font-[family-name:var(--font-mono)]">{step.promptKey}</code> no longer
                      exists. Pick a different one below.
                    </Notice>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" hint="Shown in the live run console.">
                      {({ id: fid }) => (
                        <Input id={fid} value={step.title} onChange={(e) => updateStep(step.id, { title: e.target.value })} />
                      )}
                    </Field>

                    <Field
                      label="Output key"
                      hint="How later steps refer to this one, e.g. steps.research"
                      error={duplicateKeys.includes(step.key) ? 'Another step already writes to this key' : undefined}
                    >
                      {({ id: fid, describedBy, invalid }) => (
                        <Input
                          id={fid}
                          aria-describedby={describedBy}
                          aria-invalid={invalid}
                          value={step.key}
                          onChange={(e) => updateStep(step.id, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                          className="font-[family-name:var(--font-mono)] text-xs"
                        />
                      )}
                    </Field>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Prompt">
                      {({ id: fid }) => (
                        <Select
                          id={fid}
                          value={step.promptKey}
                          onChange={(e) => {
                            const next = prompts?.find((p) => p.key === e.target.value);
                            updateStep(step.id, {
                              promptKey: e.target.value,
                              service: meta?.stages.find((s) => s.value === next?.stage)?.service ?? step.service,
                              title: step.title || next?.name || step.title,
                            });
                          }}
                        >
                          <option value="">Choose a prompt</option>
                          {(prompts ?? []).map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.name} ({p.stage})
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Field label="Runs on" hint="Which service executes this step.">
                      {({ id: fid }) => (
                        <Select id={fid} value={step.service} onChange={(e) => updateStep(step.id, { service: e.target.value })}>
                          <option value="research">research</option>
                          <option value="analysis">analysis</option>
                          <option value="outreach">outreach</option>
                        </Select>
                      )}
                    </Field>
                  </div>

                  <div className="mt-1 divide-y divide-[var(--color-border)]">
                    <SwitchRow
                      label="Enabled"
                      hint="Turn a step off to skip it without deleting it."
                      checked={step.enabled}
                      onCheckedChange={(value) => updateStep(step.id, { enabled: value })}
                    />
                    <SwitchRow
                      label="Optional"
                      hint="If this fails, the run carries on instead of abandoning the target."
                      checked={step.optional}
                      onCheckedChange={(value) => updateStep(step.id, { optional: value })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </PageBody>
      </fieldset>
    </>
  );
}
