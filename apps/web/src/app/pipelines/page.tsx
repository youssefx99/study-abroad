'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Workflow, Plus, Copy, PlayCircle, AlertTriangle, Globe, ArrowRight } from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { Pipeline } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Panel, EmptyState, Badge, Notice, Tooltip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock } from '@/components/shared';

/**
 * Pipelines.
 *
 * A pipeline is the order the prompts run in. Showing the steps inline on the
 * list means you can tell what a pipeline does without opening it, which is the
 * only way choosing one in the run wizard is an informed decision.
 */
export default function PipelinesPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<Pipeline[]>('/api/pipelines', fetcher);

  const create = async () => {
    try {
      const pipeline = await api.post<Pipeline>('/api/pipelines', {
        name: 'New pipeline',
        description: '',
        steps: [
          {
            key: 'analysis',
            title: 'Assess the fit',
            description: '',
            promptKey: 'analysis.fit_assessment',
            service: 'analysis',
            enabled: true,
            optional: false,
          },
        ],
      });
      router.push(`/pipelines/${pipeline.id}`);
    } catch (err) {
      toast.error('Could not create the pipeline', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const duplicate = async (id: string) => {
    try {
      const copy = await api.post<Pipeline>(`/api/pipelines/${id}/duplicate`);
      await mutate();
      router.push(`/pipelines/${copy.id}`);
    } catch (err) {
      toast.error('Could not duplicate', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="The order the prompts run in. Each step feeds the next, so the message at the end knows everything the earlier steps found."
        action={
          <Button variant="primary" onClick={create}>
            <Plus />
            New pipeline
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {error ? (
          <ErrorBlock error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <Panel>
            <LoadingBlock label="Loading pipelines" />
          </Panel>
        ) : !data?.length ? (
          <Panel>
            <EmptyState
              icon={<Workflow className="size-7" />}
              title="No pipelines"
              description="A pipeline chains prompts together. Create one to get started."
              action={
                <Button variant="primary" onClick={create}>
                  <Plus />
                  Create a pipeline
                </Button>
              }
            />
          </Panel>
        ) : (
          data.map((pipeline) => {
            const errors = pipeline.issues?.filter((i) => i.level === 'error') ?? [];

            return (
              <Panel key={pipeline.id}>
                <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/pipelines/${pipeline.id}`}
                        className="text-[0.9375rem] font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)]"
                      >
                        {pipeline.name}
                      </Link>
                      {pipeline.isBuiltIn && <Badge tone="muted">Built-in</Badge>}
                      {errors.length > 0 && (
                        <Badge tone="negative">
                          <AlertTriangle className="size-2.5" />
                          Needs fixing
                        </Badge>
                      )}
                    </div>
                    <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
                      {pipeline.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => duplicate(pipeline.id)}>
                      <Copy />
                      Duplicate
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/pipelines/${pipeline.id}`}>Edit</Link>
                    </Button>
                    <Button asChild variant="primary" size="sm" disabled={errors.length > 0}>
                      <Link href={`/runs/new?pipeline=${pipeline.id}`}>
                        <PlayCircle />
                        Run
                      </Link>
                    </Button>
                  </div>
                </div>

                {errors.length > 0 && (
                  <div className="px-5 pb-4">
                    <Notice tone="negative" title="This pipeline cannot run yet">
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {errors.map((issue) => (
                          <li key={issue.message}>{issue.message}</li>
                        ))}
                      </ul>
                    </Notice>
                  </div>
                )}

                {/* The step chain. Numbers are legitimate here: it really is a
                    sequence, and step three cannot run before step two. */}
                <div className="scroll-x flex items-stretch gap-0 border-t border-[var(--color-border)] px-5 py-4">
                  {pipeline.steps.map((step, index) => (
                    <React.Fragment key={step.id}>
                      {index > 0 && (
                        <div className="flex items-center px-2 text-[var(--color-text-faint)]">
                          <ArrowRight className="size-3.5" />
                        </div>
                      )}
                      <div
                        className={`min-w-[10rem] flex-1 rounded-[var(--radius-control)] border px-3 py-2.5 ${
                          step.enabled
                            ? 'border-[var(--color-border)] bg-[var(--color-surface-sunken)]'
                            : 'border-dashed border-[var(--color-border)] opacity-55'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="numeric text-[0.6875rem] text-[var(--color-text-faint)]">{index + 1}</span>
                          <span className="truncate text-[0.8125rem] font-medium text-[var(--color-text)]">{step.title}</span>
                          {step.prompt?.webSearch && (
                            <Tooltip label="Uses web search">
                              <Globe className="size-3 shrink-0 text-[var(--color-accent)]" />
                            </Tooltip>
                          )}
                        </div>
                        <p className="mt-1 truncate font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--color-text-faint)]">
                          {step.promptKey}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Badge tone="neutral">{step.service}</Badge>
                          {step.optional && <Badge tone="muted">optional</Badge>}
                          {!step.enabled && <Badge tone="muted">off</Badge>}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                <p className="border-t border-[var(--color-border)] px-5 py-2 text-[0.6875rem] text-[var(--color-text-faint)]">
                  {pipeline.stepCount ?? pipeline.steps.length} active step
                  {(pipeline.stepCount ?? pipeline.steps.length) === 1 ? '' : 's'} · edited {timeAgo(pipeline.updatedAt)}
                </p>
              </Panel>
            );
          })
        )}
      </PageBody>
    </>
  );
}
