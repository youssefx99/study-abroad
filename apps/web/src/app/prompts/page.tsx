'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { SquareTerminal, Plus, Globe, Braces, Lock, Search } from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { PromptSummary, Meta } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import {
  Panel,
  EmptyState,
  Badge,
  Notice,
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
  DialogClose,
  Tooltip,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock } from '@/components/shared';

/**
 * Prompt library.
 *
 * Grouped by stage rather than listed flat, because the stage is what tells you
 * when a prompt runs, and that is the first thing anyone needs to know before
 * editing one.
 */
export default function PromptsPage() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const { data, error, isLoading, mutate } = useSWR<PromptSummary[]>('/api/prompts', fetcher);
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((p) => [p.name, p.key, p.description, ...p.tags].join(' ').toLowerCase().includes(term));
  }, [data, search]);

  const stages = meta?.stages ?? [];

  return (
    <>
      <PageHeader
        title="Prompts"
        description="What the system actually asks the model, in full. Edit any of these and the change takes effect on the next run — no deploy, no code."
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            New prompt
          </Button>
        }
      />

      <PageBody className="space-y-5">
        <Notice tone="accent" icon={<SquareTerminal />} title="These are yours to change">
          Nothing about a discipline, a country, or a degree system is hard-coded anywhere else. If a prompt does not suit
          your situation, rewrite it. Every change is versioned, so you can always go back.
        </Notice>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prompts" className="pl-9" />
        </div>

        {error ? (
          <ErrorBlock error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <Panel>
            <LoadingBlock label="Loading prompts" />
          </Panel>
        ) : !filtered.length ? (
          <Panel>
            <EmptyState
              icon={<SquareTerminal className="size-7" />}
              title="No prompts match"
              description="Try a different search, or create a prompt of your own."
            />
          </Panel>
        ) : (
          <div className="space-y-6">
            {stages.map((stage) => {
              const prompts = filtered.filter((p) => p.stage === stage.value);
              if (!prompts.length) return null;

              return (
                <section key={stage.value} className="space-y-2.5">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{stage.label}</h2>
                    <p className="text-xs text-[var(--color-text-muted)]">{stage.description}</p>
                  </div>

                  <Panel className="overflow-hidden">
                    {prompts.map((prompt) => (
                      <Link
                        key={prompt.id}
                        href={`/prompts/${prompt.key}`}
                        className="flex items-start gap-4 border-b border-[var(--color-border)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--color-surface-sunken)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[0.875rem] font-medium text-[var(--color-text)]">{prompt.name}</span>
                            {prompt.isBuiltIn && (
                              <Tooltip label="Shipped with Flow. You can edit it, and restore the original at any time.">
                                <Badge tone="muted">
                                  <Lock className="size-2.5" />
                                  Built-in
                                </Badge>
                              </Tooltip>
                            )}
                            {prompt.webSearch && (
                              <Tooltip label="This prompt uses web search, so it is slower and costs more.">
                                <Badge tone="accent">
                                  <Globe className="size-2.5" />
                                  Web
                                </Badge>
                              </Tooltip>
                            )}
                            {prompt.hasSchema && (
                              <Tooltip label="Output is constrained to a JSON schema.">
                                <Badge tone="neutral">
                                  <Braces className="size-2.5" />
                                  Structured
                                </Badge>
                              </Tooltip>
                            )}
                          </div>

                          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">{prompt.description}</p>

                          <p className="mt-1.5 font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--color-text-faint)]">
                            {prompt.key}
                          </p>
                        </div>

                        <div className="hidden shrink-0 text-right sm:block">
                          <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text)]">{prompt.model}</p>
                          <p className="mt-1 text-[0.6875rem] text-[var(--color-text-faint)]">
                            v{prompt.activeVersion} of {prompt.versionCount} · {prompt.variableCount} variables
                          </p>
                          <p className="mt-0.5 text-[0.6875rem] text-[var(--color-text-faint)]">{timeAgo(prompt.updatedAt)}</p>
                        </div>
                      </Link>
                    ))}
                  </Panel>
                </section>
              );
            })}
          </div>
        )}
      </PageBody>

      <NewPromptDialog
        open={creating}
        meta={meta}
        onClose={() => setCreating(false)}
        onCreated={async (key) => {
          await mutate();
          router.push(`/prompts/${key}`);
        }}
        onError={(message) => toast.error('Could not create the prompt', message)}
      />
    </>
  );
}

function NewPromptDialog({
  open,
  meta,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  meta?: Meta;
  onClose: () => void;
  onCreated: (key: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [stage, setStage] = React.useState('custom');
  const [description, setDescription] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setStage('custom');
      setDescription('');
    }
  }, [open]);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);

    try {
      const prompt = await api.post<{ key: string }>('/api/prompts', {
        name: name.trim(),
        stage,
        description: description.trim(),
        userPrompt:
          'Describe the task here.\n\nAPPLICANT\n{{applicant.block}}\n\nTARGET\n{{target.block}}\n\nEarlier steps are available as {{steps.research}} and {{steps.analysis}}.',
        config: { model: 'gpt-5-mini', temperature: 0.4 },
      });
      onCreated(prompt.key);
      onClose();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="New prompt" description="Starts with a skeleton you can edit straight away.">
        <DialogBody className="space-y-4">
          <Field label="Name" required>
            {({ id }) => (
              <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Draft a follow-up message" />
            )}
          </Field>

          <Field label="Stage" hint="Decides which service runs it and where it can slot into a pipeline.">
            {({ id }) => (
              <Select id={id} value={stage} onChange={(e) => setStage(e.target.value)}>
                {(meta?.stages ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.description}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Description" hint="What this prompt is for. Shown in the library.">
            {({ id }) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" onClick={create} loading={saving} disabled={!name.trim()}>
            Create and edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
