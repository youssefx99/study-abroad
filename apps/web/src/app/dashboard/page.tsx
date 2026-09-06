'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowRight,
  UserRound,
  Target,
  Workflow,
  PlayCircle,
  KeyRound,
  CircleDot,
  Inbox,
} from 'lucide-react';
import { fetcher } from '@/lib/api';
import type { Overview, ProfileSummary, Target as TargetRecord, Pipeline } from '@/lib/types';
import { formatCost, formatNumber, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader, EmptyState, Notice, Progress, Badge } from '@/components/ui/primitives';
import {
  PageBody,
  PageHeader,
  StatTile,
  RunStatusBadge,
  LoadingBlock,
  Ledger,
  LedgerRow,
} from '@/components/shared';

/**
 * Dashboard.
 *
 * Two jobs: tell someone what state their work is in, and tell them what to do
 * next. The "next step" panel is not decoration — a first-time user with no
 * applicant and no targets needs a path, and someone with both needs a run
 * button, and those are different screens for the same person a day apart.
 */
export default function DashboardPage() {
  const { data: overview, isLoading } = useSWR<Overview>('/api/overview', fetcher, { refreshInterval: 15_000 });
  const { data: profiles } = useSWR<ProfileSummary[]>('/api/profiles', fetcher);
  const { data: targets } = useSWR<TargetRecord[]>('/api/targets', fetcher);
  const { data: pipelines } = useSWR<Pipeline[]>('/api/pipelines', fetcher);

  const profileCount = profiles?.length ?? 0;
  const targetCount = targets?.length ?? 0;
  const readyToRun = profileCount > 0 && targetCount > 0;
  const topProfile = profiles?.[0];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything that has run, and what to do next."
        action={
          readyToRun ? (
            <Button asChild variant="primary">
              <Link href="/runs/new">
                <PlayCircle />
                Start a run
              </Link>
            </Button>
          ) : null
        }
      />

      <PageBody className="space-y-6">
        {overview?.demoModeActive && (
          <Notice
            tone="warning"
            icon={<CircleDot />}
            title="Demo mode is on"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href="/settings">
                  <KeyRound />
                  Add a key
                </Link>
              </Button>
            }
          >
            Every stage returns representative output instead of calling a model. The whole product works, but nothing is
            researched and no draft is real. Add an OpenAI API key to run for real.
          </Notice>
        )}

        <NextStep
          profileCount={profileCount}
          targetCount={targetCount}
          runCount={overview?.totals.runs ?? 0}
          profileId={topProfile?.id}
          completeness={topProfile?.completeness.percent ?? 0}
        />

        <Panel className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          <StatTile label="Runs" value={formatNumber(overview?.totals.runs ?? 0)} hint="All time" />
          <StatTile
            label="Drafts produced"
            value={formatNumber(overview?.totals.drafts ?? 0)}
            hint="Targets that finished"
            tone="accent"
          />
          <StatTile
            label="Tokens used"
            value={formatNumber(overview?.totals.tokens ?? 0)}
            hint={`${formatCost(overview?.totals.estimatedCostUsd ?? 0)} estimated`}
          />
          <StatTile
            label="Failed targets"
            value={formatNumber(overview?.totals.failed ?? 0)}
            hint={overview?.totals.failed ? 'Open a run to see why' : 'Nothing to fix'}
            tone={overview?.totals.failed ? 'negative' : undefined}
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader
              title="Recent runs"
              description="The last few times you processed a list."
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/runs">
                    View all
                    <ArrowRight />
                  </Link>
                </Button>
              }
            />

            {isLoading ? (
              <LoadingBlock />
            ) : !overview?.recentRuns.length ? (
              <EmptyState
                icon={<Inbox className="size-7" />}
                title="No runs yet"
                description="A run takes your applicant profile and a list of targets, researches each one, and drafts a message."
                action={
                  readyToRun ? (
                    <Button asChild variant="primary">
                      <Link href="/runs/new">
                        <PlayCircle />
                        Start your first run
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div>
                {overview.recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--color-surface-sunken)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] font-medium text-[var(--color-text)]">{run.label}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                        {run.profileName} · {run.pipelineName} · {timeAgo(run.createdAt)}
                      </p>
                    </div>

                    <div className="hidden w-28 shrink-0 sm:block">
                      <Progress
                        value={run.summary.percent}
                        tone={run.summary.failed ? 'warning' : 'accent'}
                      />
                      <p className="mt-1 text-[0.6875rem] text-[var(--color-text-faint)]">
                        {run.summary.succeeded}/{run.summary.targets} done
                      </p>
                    </div>

                    <RunStatusBadge status={run.status} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Your workspace" />
              <Ledger className="rounded-none border-0 shadow-none">
                <WorkspaceRow
                  href="/applicants"
                  icon={<UserRound className="size-4" />}
                  label="Applicants"
                  count={profileCount}
                  hint={topProfile ? `${topProfile.completeness.percent}% complete` : 'None yet'}
                />
                <WorkspaceRow
                  href="/targets"
                  icon={<Target className="size-4" />}
                  label="Targets"
                  count={targetCount}
                  hint={targetCount ? `${new Set(targets?.map((t) => t.country).filter(Boolean)).size} countries` : 'None yet'}
                />
                <WorkspaceRow
                  href="/pipelines"
                  icon={<Workflow className="size-4" />}
                  label="Pipelines"
                  count={pipelines?.length ?? 0}
                  hint="Ready to use"
                />
              </Ledger>
            </Panel>

            {targetCount > 0 && (
              <Panel>
                <PanelHeader title="Targets by status" description="Where each one sits in the process." />
                <div className="space-y-2.5 px-4 py-4">
                  {Object.entries(
                    (targets ?? []).reduce<Record<string, number>>((acc, target) => {
                      acc[target.status] = (acc[target.status] ?? 0) + 1;
                      return acc;
                    }, {}),
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between gap-3">
                        <span className="text-[0.8125rem] capitalize text-[var(--color-text-muted)]">{status}</span>
                        <span className="numeric text-[var(--color-text)]">{count}</span>
                      </div>
                    ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function WorkspaceRow({
  href,
  icon,
  label,
  count,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  hint: string;
}) {
  return (
    <Link href={href}>
      <LedgerRow className="hover:bg-[var(--color-surface-sunken)]">
        <span className="text-[var(--color-text-faint)]">{icon}</span>
        <span className="flex-1 text-[0.8125rem] font-medium text-[var(--color-text)]">{label}</span>
        <span className="text-[0.6875rem] text-[var(--color-text-faint)]">{hint}</span>
        <span className="numeric w-8 text-right text-[var(--color-text)]">{count}</span>
      </LedgerRow>
    </Link>
  );
}

/**
 * The single most useful thing on this page: what to do right now.
 *
 * A dashboard that shows zeroes and nothing else leaves a new user stuck. This
 * resolves to exactly one action based on what is missing.
 */
function NextStep({
  profileCount,
  targetCount,
  runCount,
  profileId,
  completeness,
}: {
  profileCount: number;
  targetCount: number;
  runCount: number;
  profileId?: string;
  completeness: number;
}) {
  if (profileCount === 0) {
    return (
      <StepCard
        step={1}
        title="Start with your profile"
        body="Everything the system writes is built from this. Add your background, what you are applying for, and your research interests."
        href="/applicants"
        cta="Create your profile"
      />
    );
  }

  if (targetCount === 0) {
    return (
      <StepCard
        step={2}
        title="Add who you are writing to"
        body="Professors, degree programmes, scholarships, labs, or companies. Add them one at a time, or paste a whole list."
        href="/targets"
        cta="Add targets"
      />
    );
  }

  if (runCount === 0) {
    return (
      <StepCard
        step={3}
        title="You are ready to run"
        body="Pick your profile, choose targets, and the pipeline will research each one, judge the fit, and draft a message."
        href="/runs/new"
        cta="Start a run"
      />
    );
  }

  if (completeness < 70 && profileId) {
    return (
      <StepCard
        step={0}
        title={`Your profile is ${completeness}% complete`}
        body="Thin profiles produce generic drafts. Filling in your research statement and experience makes the biggest difference."
        href={`/applicants/${profileId}`}
        cta="Improve your profile"
        tone="warning"
      />
    );
  }

  return null;
}

function StepCard({
  step,
  title,
  body,
  href,
  cta,
  tone = 'accent',
}: {
  step: number;
  title: string;
  body: string;
  href: string;
  cta: string;
  tone?: 'accent' | 'warning';
}) {
  return (
    <Panel className="flex flex-wrap items-center gap-x-5 gap-y-4 px-5 py-4">
      {/* A number is used here because these really are sequential steps. */}
      {step > 0 && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] font-[family-name:var(--font-display)] text-[0.875rem] font-semibold text-[var(--color-accent)]">
          {step}
        </span>
      )}

      <div className="min-w-[16rem] flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{title}</h2>
          {tone === 'warning' && <Badge tone="warning">Worth doing</Badge>}
        </div>
        <p className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">{body}</p>
      </div>

      <Button asChild variant="primary">
        <Link href={href}>
          {cta}
          <ArrowRight />
        </Link>
      </Button>
    </Panel>
  );
}
