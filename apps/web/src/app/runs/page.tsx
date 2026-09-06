'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { PlayCircle, History, CircleDot } from 'lucide-react';
import { fetcher } from '@/lib/api';
import type { RunListEntry } from '@/lib/types';
import { formatCost, formatDuration, formatNumber, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Panel, EmptyState, Progress, Badge } from '@/components/ui/primitives';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock, RunStatusBadge } from '@/components/shared';

/**
 * Run history.
 *
 * Polled rather than streamed: this page shows many runs at once, and one
 * stream per run would be wasteful when a ten-second refresh is indistinguishable
 * at this level of detail. The individual run page streams properly.
 */
export default function RunsPage() {
  const { data, error, isLoading, mutate } = useSWR<RunListEntry[]>('/api/runs', fetcher, { refreshInterval: 10_000 });

  return (
    <>
      <PageHeader
        title="Runs"
        description="Every time you processed a list. Open one to read the drafts it produced."
        action={
          <Button asChild variant="primary">
            <Link href="/runs/new">
              <PlayCircle />
              New run
            </Link>
          </Button>
        }
      />

      <PageBody>
        {error ? (
          <ErrorBlock error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <Panel>
            <LoadingBlock label="Loading runs" />
          </Panel>
        ) : !data?.length ? (
          <Panel>
            <EmptyState
              icon={<History className="size-7" />}
              title="No runs yet"
              description="A run researches each target, judges the fit, and drafts a message. Everything it produces stays here."
              action={
                <Button asChild variant="primary">
                  <Link href="/runs/new">
                    <PlayCircle />
                    Start a run
                  </Link>
                </Button>
              }
            />
          </Panel>
        ) : (
          <Panel className="overflow-hidden">
            {data.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--color-surface-sunken)]"
              >
                <div className="min-w-[14rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.875rem] font-medium text-[var(--color-text)]">{run.label}</span>
                    <RunStatusBadge status={run.status} />
                    {run.options.demoMode && (
                      <Badge tone="warning">
                        <CircleDot className="size-2.5" />
                        Demo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {run.profileName} · {run.pipelineName} · {timeAgo(run.createdAt)}
                  </p>
                </div>

                <div className="w-32 shrink-0">
                  <Progress value={run.summary.percent} tone={run.summary.failed ? 'warning' : 'accent'} />
                  <p className="mt-1 text-[0.6875rem] text-[var(--color-text-faint)]">
                    {run.summary.succeeded}/{run.summary.targets} done
                    {run.summary.failed > 0 && ` · ${run.summary.failed} failed`}
                  </p>
                </div>

                <div className="hidden w-24 shrink-0 text-right sm:block">
                  <p className="numeric text-[var(--color-text)]">{formatNumber(run.summary.totalTokens)}</p>
                  <p className="text-[0.6875rem] text-[var(--color-text-faint)]">tokens</p>
                </div>

                <div className="hidden w-20 shrink-0 text-right md:block">
                  <p className="numeric text-[var(--color-text)]">
                    {run.options.demoMode ? '—' : formatCost(run.summary.estimatedCostUsd)}
                  </p>
                  <p className="text-[0.6875rem] text-[var(--color-text-faint)]">estimated</p>
                </div>

                <div className="hidden w-20 shrink-0 text-right lg:block">
                  <p className="numeric text-[var(--color-text)]">{formatDuration(run.summary.durationMs)}</p>
                  <p className="text-[0.6875rem] text-[var(--color-text-faint)]">elapsed</p>
                </div>
              </Link>
            ))}
          </Panel>
        )}
      </PageBody>
    </>
  );
}
