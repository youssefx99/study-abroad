'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Workflow, PlayCircle, ArrowRight, Globe } from 'lucide-react';
import { fetcher } from '@/lib/api';
import type { Pipeline } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Panel, EmptyState, Badge, Tooltip } from '@/components/ui/primitives';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock } from '@/components/shared';

/**
 * Pipelines, read only.
 *
 * This page answers one question — what happens to each target, in what order —
 * and nothing else. It is not an editor: a pipeline is a sequence whose steps
 * feed each other, and rearranging it correctly needs more context than the
 * screen can give. Showing it as a single continuous path rather than a row of
 * separate cards is the point: the arrows are the information.
 */
export default function PipelinesPage() {
  const { data, error, isLoading, mutate } = useSWR<Pipeline[]>('/api/pipelines', fetcher);

  return (
    <>
      <PageHeader title="Pipelines" description="What happens to each target, in order." />

      <PageBody className="space-y-5">
        {error ? (
          <ErrorBlock error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <Panel>
            <LoadingBlock label="Loading pipelines" />
          </Panel>
        ) : !data?.length ? (
          <Panel>
            <EmptyState icon={<Workflow className="size-7" />} title="No pipelines" />
          </Panel>
        ) : (
          data.map((pipeline) => {
            const steps = pipeline.steps.filter((s) => s.enabled);

            return (
              <Panel key={pipeline.id}>
                <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{pipeline.name}</h2>
                    <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
                      {pipeline.description}
                    </p>
                  </div>

                  <Button asChild variant="primary" size="sm">
                    <Link href={`/runs/new?pipeline=${pipeline.id}`}>
                      <PlayCircle />
                      Run
                    </Link>
                  </Button>
                </div>

                <FlowPath steps={steps} />
              </Panel>
            );
          })
        )}
      </PageBody>
    </>
  );
}

/**
 * One continuous path.
 *
 * Each step sits on a single horizontal line joined by arrows, so the sequence
 * reads as one process rather than a set of unrelated boxes. It scrolls
 * sideways on a narrow screen instead of wrapping, because a wrapped sequence
 * stops looking like a sequence.
 */
function FlowPath({ steps }: { steps: Pipeline['steps'] }) {
  return (
    <div className="scroll-x border-t border-[var(--color-border)] px-5 py-6">
      <div className="flex min-w-max items-center">
        <Node label="Target" muted />

        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <Connector />
            <Node label={step.title} index={index + 1} web={step.prompt?.webSearch} optional={step.optional} />
          </React.Fragment>
        ))}

        <Connector />
        <Node label="Your draft" done />
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex shrink-0 items-center px-1" aria-hidden>
      <span className="h-px w-8 bg-[var(--color-border-strong)]" />
      <ArrowRight className="-ml-1 size-3.5 text-[var(--color-border-strong)]" />
    </div>
  );
}

function Node({
  label,
  index,
  web,
  optional,
  muted,
  done,
}: {
  label: string;
  index?: number;
  web?: boolean;
  optional?: boolean;
  muted?: boolean;
  done?: boolean;
}) {
  return (
    <div
      className={[
        'flex shrink-0 flex-col items-center gap-2 rounded-[var(--radius-control)] border px-4 py-3 text-center',
        muted
          ? 'border-dashed border-[var(--color-border-strong)] bg-transparent'
          : done
            ? 'border-transparent bg-[var(--color-signal-soft)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-sunken)]',
      ].join(' ')}
    >
      {index !== undefined && (
        <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-accent)] font-[family-name:var(--font-mono)] text-[0.6875rem] font-medium text-[var(--color-accent-contrast)]">
          {index}
        </span>
      )}

      <span
        className={[
          'max-w-[9rem] text-[0.8125rem] font-medium leading-snug',
          muted ? 'text-[var(--color-text-faint)]' : done ? 'text-[var(--color-signal)]' : 'text-[var(--color-text)]',
        ].join(' ')}
      >
        {label}
      </span>

      {(web || optional) && (
        <div className="flex gap-1">
          {web && (
            <Tooltip label="Searches the web. Slower.">
              <Badge tone="accent">
                <Globe className="size-2.5" />
              </Badge>
            </Tooltip>
          )}
          {optional && <Badge tone="muted">optional</Badge>}
        </div>
      )}
    </div>
  );
}
