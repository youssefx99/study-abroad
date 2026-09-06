'use client';

import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Square,
  RefreshCw,
  CircleDot,
  AlertTriangle,
  Terminal,
  Mail,
  ChevronRight,
  Save,
  Pencil,
  Download,
} from 'lucide-react';
import { api, fetcher, subscribeToRun, ApiError } from '@/lib/api';
import type { Run, RunItem, RunStep, RunEvent, RunStreamMessage } from '@/lib/types';
import { cn, countWords, formatCost, formatDuration, formatNumber, humanizeKey, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea, Input } from '@/components/ui/field';
import { Panel, Tabs, TabsList, TabsTrigger, TabsContent, Badge, Notice, Progress, Tooltip, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  PageBody,
  PageHeader,
  LoadingBlock,
  ErrorBlock,
  StepStatusBadge,
  RunStatusBadge,
  StatTile,
  StructuredOutput,
  JsonBlock,
  CopyButton,
} from '@/components/shared';

/**
 * Run detail.
 *
 * Live while it is running, readable forever afterwards. The stream carries
 * per-target updates so the console fills in as work completes rather than
 * jumping from empty to finished, which is the difference between a progress
 * indicator you trust and one you reload.
 */
export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();

  const { data, error, isLoading, mutate } = useSWR<Run>(`/api/runs/${id}`, fetcher);
  const [run, setRun] = React.useState<Run | null>(null);
  const [selectedTarget, setSelectedTarget] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [streamLost, setStreamLost] = React.useState(false);

  /**
   * Merge rule between the polled copy and the streamed one.
   *
   * While a run is live the stream is always ahead of a refetch, so an SWR
   * revalidation (a window refocus, say) must not overwrite progress that has
   * already arrived. Once the run has finished it is static, and the server
   * copy is the authoritative one.
   */
  React.useEffect(() => {
    if (!data) return;

    setRun((current) => {
      if (!current || current.id !== data.id) return data;
      if (data.status !== 'running' && data.status !== 'queued') return data;
      return current;
    });
  }, [data]);

  const isLive = run?.status === 'running' || run?.status === 'queued';

  // Subscribe only while the run can still change. A finished run is static, so
  // holding a connection open for it wastes a socket on both ends.
  React.useEffect(() => {
    if (!isLive) return;

    const unsubscribe = subscribeToRun(
      id,
      (raw) => {
        const message = raw as RunStreamMessage;
        setStreamLost(false);

        setRun((current) => {
          if (!current) return current;

          switch (message.kind) {
            case 'snapshot':
              return message.run;
            case 'event':
              return { ...current, events: [...current.events, message.event].slice(-400) };
            case 'item':
              return {
                ...current,
                items: current.items.map((item) => (item.targetId === message.item.targetId ? message.item : item)),
                summary: message.summary,
              };
            case 'status':
              return { ...current, status: message.status, summary: message.summary ?? current.summary };
            default:
              return current;
          }
        });

        if (message.kind === 'done') mutate();
      },
      () => setStreamLost(true),
    );

    return unsubscribe;
  }, [id, isLive, mutate]);

  // Open the first target that has something to show, so the results pane is
  // never empty when there is output to read.
  React.useEffect(() => {
    if (selectedTarget || !run?.items.length) return;
    const withOutput = run.items.find((item) => item.steps.some((s) => s.status === 'succeeded'));
    setSelectedTarget((withOutput ?? run.items[0]).targetId);
  }, [run, selectedTarget]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.post(`/api/runs/${id}/cancel`);
      toast.success('Cancelling', 'Steps already in flight will finish first.');
    } catch (err) {
      toast.error('Could not cancel', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    return (
      <PageBody>
        <ErrorBlock error={error} onRetry={() => mutate()} />
      </PageBody>
    );
  }

  if (isLoading || !run) {
    return (
      <PageBody>
        <Panel>
          <LoadingBlock label="Loading run" />
        </Panel>
      </PageBody>
    );
  }

  const item = run.items.find((i) => i.targetId === selectedTarget) ?? run.items[0] ?? null;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/runs', label: 'Runs' },
          { href: `/runs/${id}`, label: run.label },
        ]}
        title={run.label}
        description={`${run.profileName} · ${run.pipelineName} · started ${timeAgo(run.startedAt ?? run.createdAt)}`}
        action={
          <>
            <RunStatusBadge status={run.status} />
            {run.options.demoMode && (
              <Badge tone="warning">
                <CircleDot className="size-2.5" />
                Demo mode
              </Badge>
            )}
            {isLive ? (
              <Button variant="danger" onClick={cancel} loading={cancelling}>
                <Square />
                Cancel run
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => mutate()}>
                <RefreshCw />
                Refresh
              </Button>
            )}
          </>
        }
      />

      <PageBody className="space-y-5">
        {streamLost && isLive && (
          <Notice tone="warning" icon={<AlertTriangle />} action={<Button size="sm" variant="secondary" onClick={() => mutate()}>Refresh</Button>}>
            Lost the live connection. The run is still going on the server; refresh to catch up.
          </Notice>
        )}

        {run.error && <Notice tone="negative" title="The run stopped early">{run.error}</Notice>}

        {run.options.demoMode && (
          <Notice tone="warning" icon={<CircleDot />} title="This is demo output">
            No research was performed and no model was called. Everything below is representative structure, not real
            findings.{' '}
            <Link href="/settings" className="underline">
              Add an API key
            </Link>{' '}
            to run for real.
          </Notice>
        )}

        <Panel className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          <StatTile
            label="Progress"
            value={`${run.summary.succeeded}/${run.summary.targets}`}
            hint={run.summary.failed ? `${run.summary.failed} failed` : 'targets finished'}
            tone={run.summary.failed ? 'warning' : undefined}
          />
          <StatTile label="Tokens" value={formatNumber(run.summary.totalTokens)} hint={`${formatNumber(run.summary.reasoningTokens)} reasoning`} />
          <StatTile
            label="Estimated cost"
            value={run.options.demoMode ? '—' : formatCost(run.summary.estimatedCostUsd)}
            hint={run.options.demoMode ? 'demo run' : 'approximate'}
          />
          <StatTile label="Elapsed" value={formatDuration(run.summary.durationMs)} hint={isLive ? 'still going' : 'total'} />
        </Panel>

        {isLive && (
          <div className="space-y-1.5">
            <Progress value={run.summary.percent} tone={run.summary.failed ? 'warning' : 'accent'} />
            <p className="text-xs text-[var(--color-text-muted)]">
              {run.summary.running} in progress, {run.summary.pending} waiting
            </p>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Target list, doubling as progress. */}
          <Panel className="overflow-hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
            <div className="sticky top-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
              <h2 className="text-[0.8125rem] font-semibold text-[var(--color-text)]">
                Targets ({run.items.length})
              </h2>
            </div>

            {run.items.map((entry) => (
              <button
                key={entry.targetId}
                type="button"
                onClick={() => setSelectedTarget(entry.targetId)}
                className={cn(
                  'block w-full border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors last:border-b-0',
                  entry.targetId === item?.targetId
                    ? 'bg-[var(--color-accent-soft)]'
                    : 'hover:bg-[var(--color-surface-sunken)]',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-[var(--color-text)]">
                    {entry.targetName}
                  </span>
                  <StepStatusBadge status={entry.status} />
                </div>

                {/* Step pips: one tick per step, coloured by outcome. Reads at a
                    glance and needs no legend once you have seen one finish. */}
                <div className="mt-2 flex gap-1">
                  {entry.steps.map((step) => (
                    <Tooltip key={step.key} label={`${step.title}: ${step.status}`}>
                      <span
                        className={cn(
                          'h-1 flex-1 rounded-full',
                          step.status === 'succeeded' && 'bg-[var(--color-signal)]',
                          step.status === 'running' && 'animate-working bg-[var(--color-amber)]',
                          step.status === 'failed' && 'bg-[var(--color-rose)]',
                          step.status === 'pending' && 'bg-[var(--color-border-strong)]',
                          step.status === 'skipped' && 'bg-[var(--color-border)]',
                        )}
                      />
                    </Tooltip>
                  ))}
                </div>

                {entry.error && <p className="mt-1.5 line-clamp-2 text-[0.6875rem] text-[var(--color-rose)]">{entry.error}</p>}
              </button>
            ))}
          </Panel>

          <div className="min-w-0 space-y-5">
            {item ? <TargetResult key={item.targetId} runId={id} item={item} onSaved={() => mutate()} /> : null}
            <EventConsole events={run.events} live={isLive} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One target's results, one tab per pipeline step.
 *
 * The tabs follow the pipeline order rather than being sorted, because the
 * order is the story: what was found, what it means, what to send.
 */
function TargetResult({ runId, item, onSaved }: { runId: string; item: RunItem; onSaved: () => void }) {
  const [tab, setTab] = React.useState(() => {
    // Open on the thing people actually came for: the finished message.
    const message = [...item.steps].reverse().find((s) => s.status === 'succeeded' && isMessage(s.output));
    const anyDone = item.steps.find((s) => s.status === 'succeeded');
    return message?.key ?? anyDone?.key ?? item.steps[0]?.key ?? '';
  });

  React.useEffect(() => {
    if (item.steps.some((s) => s.key === tab)) return;
    setTab(item.steps[0]?.key ?? '');
  }, [item.steps, tab]);

  const totalTokens = item.steps.reduce((sum, step) => sum + (step.usage?.totalTokens ?? 0), 0);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{item.targetName}</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {item.steps.filter((s) => s.status === 'succeeded').length} of {item.steps.length} steps ·{' '}
            {formatDuration(item.durationMs)} · {formatNumber(totalTokens)} tokens
          </p>
        </div>
        <StepStatusBadge status={item.status} />
      </div>

      {item.error && (
        <div className="px-5 pt-4">
          <Notice tone="negative" title="This target did not finish">
            {item.error}
          </Notice>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="px-3">
          {item.steps.map((step, index) => (
            <TabsTrigger key={step.key} value={step.key} disabled={step.status === 'pending'}>
              <span className="numeric mr-1.5 text-[var(--color-text-faint)]">{index + 1}</span>
              {step.title}
              {step.status === 'running' && <span className="ml-1.5 inline-block size-1.5 animate-working rounded-full bg-[var(--color-amber)]" />}
              {step.status === 'failed' && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-[var(--color-rose)]" />}
            </TabsTrigger>
          ))}
        </TabsList>

        {item.steps.map((step) => (
          <TabsContent key={step.key} value={step.key} className="p-5">
            <StepPanel runId={runId} targetId={item.targetId} step={step} onSaved={onSaved} />
          </TabsContent>
        ))}
      </Tabs>
    </Panel>
  );
}

/** A step output that looks like a message gets the message editor. */
function isMessage(output: unknown): output is { subject: string; body: string } {
  return (
    typeof output === 'object' &&
    output !== null &&
    typeof (output as Record<string, unknown>).body === 'string' &&
    typeof (output as Record<string, unknown>).subject === 'string'
  );
}

function StepPanel({
  runId,
  targetId,
  step,
  onSaved,
}: {
  runId: string;
  targetId: string;
  step: RunStep;
  onSaved: () => void;
}) {
  const [view, setView] = React.useState<'formatted' | 'json'>('formatted');

  if (step.status === 'pending') {
    return <p className="py-8 text-center text-[0.8125rem] text-[var(--color-text-faint)]">Waiting for the earlier steps.</p>;
  }

  if (step.status === 'running') {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="size-2 animate-working rounded-full bg-[var(--color-amber)]" />
        <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
          {step.title} is running{step.service === 'research' ? '. Web research can take a few minutes.' : '…'}
        </p>
      </div>
    );
  }

  if (step.status === 'skipped') {
    return <p className="py-8 text-center text-[0.8125rem] text-[var(--color-text-faint)]">Skipped because an earlier step failed.</p>;
  }

  if (step.status === 'failed') {
    return (
      <Notice tone="negative" title={`${step.title} failed`}>
        {step.error}
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-[var(--color-text-faint)]">
          <Badge tone="neutral">{step.service}</Badge>
          <span className="font-[family-name:var(--font-mono)]">
            {step.promptKey}
            {step.promptVersion !== null && ` v${step.promptVersion}`}
          </span>
          <span>·</span>
          <span>{formatDuration(step.durationMs)}</span>
          {step.usage && (
            <>
              <span>·</span>
              <span>{formatNumber(step.usage.totalTokens)} tokens</span>
              <span>·</span>
              <span className="font-[family-name:var(--font-mono)]">{step.usage.model}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border)] p-0.5">
          <button
            type="button"
            onClick={() => setView('formatted')}
            className={cn(
              'rounded-[5px] px-2 py-1 text-[0.6875rem] font-medium transition-colors',
              view === 'formatted' ? 'bg-[var(--color-surface-sunken)] text-[var(--color-text)]' : 'text-[var(--color-text-faint)]',
            )}
          >
            Readable
          </button>
          <button
            type="button"
            onClick={() => setView('json')}
            className={cn(
              'rounded-[5px] px-2 py-1 text-[0.6875rem] font-medium transition-colors',
              view === 'json' ? 'bg-[var(--color-surface-sunken)] text-[var(--color-text)]' : 'text-[var(--color-text-faint)]',
            )}
          >
            JSON
          </button>
        </div>
      </div>

      {step.missingVariables.length > 0 && (
        <Notice tone="warning" icon={<AlertTriangle />} title="Some prompt variables were empty">
          <code className="font-[family-name:var(--font-mono)]">{step.missingVariables.join(', ')}</code> resolved to
          nothing, so this output is thinner than it should be. Fill those fields in, or fix the variable names in the
          prompt.
        </Notice>
      )}

      {view === 'json' ? (
        <JsonBlock value={step.output} filename={`${targetId}-${step.key}.json`} />
      ) : isMessage(step.output) ? (
        <MessageEditor runId={runId} targetId={targetId} step={step} output={step.output} onSaved={onSaved} />
      ) : (
        <StructuredOutput value={step.output} />
      )}
    </div>
  );
}

/**
 * The message editor.
 *
 * A generated draft is a starting point, and everyone edits before sending. If
 * the edit has to happen in a mail client, the version in Flow immediately goes
 * stale and the run stops being a record of what was actually sent.
 */
function MessageEditor({
  runId,
  targetId,
  step,
  output,
  onSaved,
}: {
  runId: string;
  targetId: string;
  step: RunStep;
  output: { subject: string; body: string } & Record<string, unknown>;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [subject, setSubject] = React.useState(output.subject);
  const [body, setBody] = React.useState(output.body);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setSubject(output.subject);
    setBody(output.body);
  }, [output.subject, output.body]);

  const claims = Array.isArray(output.claims_used) ? (output.claims_used as string[]) : [];
  const risks = Array.isArray(output.remaining_risks) ? (output.remaining_risks as string[]) : [];
  const changes = Array.isArray(output.changes_made) ? (output.changes_made as string[]) : [];
  const words = countWords(body);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/runs/${runId}/items/${targetId}/steps/${step.key}`, {
        output: { ...output, subject, body, word_count: words },
      });
      onSaved();
      setEditing(false);
      toast.success('Saved', 'Your edits are stored with the run.');
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const plainText = `Subject: ${subject}\n\n${body}`;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[0.6875rem] text-[var(--color-text-faint)]">
            <Mail className="size-3.5" />
            <span>{words} words</span>
          </div>

          <div className="flex items-center gap-1">
            <CopyButton value={plainText} label="Copy message" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const blob = new Blob([plainText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `${subject.slice(0, 50).replace(/[^\w\s-]/g, '') || 'message'}.txt`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download />
              Save as text
            </Button>
            {editing ? (
              <Button variant="primary" size="sm" onClick={save} loading={saving}>
                <Save />
                Save edits
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil />
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="space-y-1">
            <p className="text-[0.6875rem] font-medium text-[var(--color-text-faint)]">Subject</p>
            {editing ? (
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            ) : (
              <p className="text-[0.9375rem] font-medium text-[var(--color-text)]">{subject}</p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-[0.6875rem] font-medium text-[var(--color-text-faint)]">Message</p>
            {editing ? (
              <Textarea rows={18} value={body} onChange={(e) => setBody(e.target.value)} className="leading-relaxed" />
            ) : (
              <div className="prose-body whitespace-pre-wrap text-[0.875rem] text-[var(--color-text)]">{body}</div>
            )}
          </div>
        </div>
      </div>

      {/* Verification affordances. The model is told to list what it claimed, so
          the applicant can check facts before their name is attached to them. */}
      {claims.length > 0 && (
        <Notice tone="neutral" title="Check these claims before sending">
          <ul className="mt-1 space-y-1">
            {claims.map((claim, index) => (
              <li key={index} className="flex gap-2">
                <ChevronRight className="mt-0.5 size-3 shrink-0" />
                <span>{claim}</span>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {risks.length > 0 && (
        <Notice tone="warning" icon={<AlertTriangle />} title="Still worth verifying yourself">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {risks.map((risk, index) => (
              <li key={index}>{risk}</li>
            ))}
          </ul>
        </Notice>
      )}

      {changes.length > 0 && (
        <details className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2.5">
          <summary className="cursor-pointer text-[0.8125rem] font-medium text-[var(--color-text)]">
            What the review step changed ({changes.length})
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[0.8125rem] text-[var(--color-text-muted)]">
            {changes.map((change, index) => (
              <li key={index}>{change}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Anything else the schema returned still gets shown; a user-defined
          field must never silently disappear from the results view. */}
      {Object.keys(output).filter((key) => !HANDLED_KEYS.has(key)).length > 0 && (
        <details className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2.5">
          <summary className="cursor-pointer text-[0.8125rem] font-medium text-[var(--color-text)]">
            Other fields from this step
          </summary>
          <dl className="mt-3 space-y-3">
            {Object.entries(output)
              .filter(([key]) => !HANDLED_KEYS.has(key))
              .map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <dt className="text-[0.6875rem] font-medium text-[var(--color-text-faint)]">{humanizeKey(key)}</dt>
                  <dd>
                    <StructuredOutput value={value} depth={1} />
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      )}
    </div>
  );
}

const HANDLED_KEYS = new Set(['subject', 'body', 'claims_used', 'remaining_risks', 'changes_made', 'word_count']);

/**
 * The live console.
 *
 * The one place in the product with orchestrated motion: rows arrive as work
 * completes. Everything else stays still so this reads as activity rather than
 * decoration.
 */
function EventConsole({ events, live }: { events: RunEvent[]; live: boolean }) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = React.useState(true);

  React.useEffect(() => {
    if (!pinned || !scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [events.length, pinned]);

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="size-3.5 text-[var(--color-text-faint)]" />
          <h3 className="text-[0.8125rem] font-semibold text-[var(--color-text)]">Activity</h3>
          {live && <span className="size-1.5 animate-working rounded-full bg-[var(--color-signal)]" />}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[0.6875rem] text-[var(--color-text-faint)]">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-[var(--color-accent)]" />
            Follow
          </label>
          <CopyButton value={events.map((e) => `${e.at} [${e.level}] ${e.message}`).join('\n')} size="iconSm" label="Copy log" />
        </div>
      </div>

      <div ref={scroller} className="max-h-72 overflow-y-auto">
        {events.length === 0 ? (
          <EmptyState title="Nothing yet" description="Activity appears here as the run works through your targets." className="py-8" />
        ) : (
          events.map((event, index) => (
            <div
              key={`${event.at}-${index}`}
              className="animate-row-in flex gap-3 border-b border-[var(--color-border)] px-4 py-1.5 text-xs last:border-b-0"
            >
              <span className="numeric shrink-0 text-[0.6875rem] text-[var(--color-text-faint)]">
                {event.at.slice(11, 19)}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[0.6875rem]',
                  event.level === 'success' && 'text-[var(--color-signal)]',
                  event.level === 'warning' && 'text-[var(--color-amber)]',
                  event.level === 'error' && 'text-[var(--color-rose)]',
                  event.level === 'info' && 'text-[var(--color-text-faint)]',
                )}
              >
                ●
              </span>
              <span className="min-w-0 flex-1 leading-relaxed text-[var(--color-text-muted)]">{event.message}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
