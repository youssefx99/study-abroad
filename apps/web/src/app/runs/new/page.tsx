'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
  Search,
  UserRound,
  Target as TargetIcon,
  Workflow,
  SlidersHorizontal,
  ClipboardCheck,
  AlertTriangle,
  Globe,
  CircleDot,
} from 'lucide-react';
import { api, fetcher, ApiError, CLOUD_MODE } from '@/lib/api';
import { ApiKeyCard, useApiKeyState } from '@/components/api-key-card';
import type { ProfileSummary, Target, Pipeline, Meta, Settings, Run } from '@/lib/types';
import { cn, formatCost, formatNumber, truncate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select, Checkbox } from '@/components/ui/field';
import { Panel, Badge, Notice, Progress, SwitchRow, Tooltip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock } from '@/components/shared';

/**
 * The run wizard.
 *
 * Five ordered steps, because launching a run is genuinely sequential: you
 * cannot sensibly choose options before you know how many targets you picked,
 * and the review step exists because this is the one action in the product that
 * spends money. Every step validates before it lets you past, and the summary
 * rail on the right accumulates the decisions so nothing is hidden behind a
 * back button.
 */

const STEPS = [
  { key: 'applicant', label: 'Applicant', icon: UserRound, blurb: 'Who is applying' },
  { key: 'targets', label: 'Targets', icon: TargetIcon, blurb: 'Who to write to' },
  { key: 'pipeline', label: 'Pipeline', icon: Workflow, blurb: 'What happens to each one' },
  { key: 'options', label: 'Options', icon: SlidersHorizontal, blurb: 'Language, tone, length' },
  { key: 'review', label: 'Review', icon: ClipboardCheck, blurb: 'Check and launch' },
] as const;

/**
 * `useSearchParams` opts a route out of static prerendering unless it sits
 * under a Suspense boundary. Keeping the boundary here means the page shell
 * still renders instantly while the preselected targets resolve.
 */
export default function NewRunPage() {
  return (
    <Suspense
      fallback={
        <PageBody>
          <Panel>
            <LoadingBlock label="Preparing" />
          </Panel>
        </PageBody>
      }
    >
      <RunWizard />
    </Suspense>
  );
}

function RunWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const { data: profiles } = useSWR<ProfileSummary[]>('/api/profiles', fetcher);
  const { data: targets } = useSWR<Target[]>('/api/targets', fetcher);
  const { data: pipelines } = useSWR<Pipeline[]>('/api/pipelines', fetcher);
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);
  const { data: settings } = useSWR<Settings>('/api/settings', fetcher);

  const [stepIndex, setStepIndex] = React.useState(0);
  const [profileId, setProfileId] = React.useState('');
  const [pipelineId, setPipelineId] = React.useState('');
  const [selectedTargets, setSelectedTargets] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const [launching, setLaunching] = React.useState(false);
  const keyState = useApiKeyState();

  const [options, setOptions] = React.useState({
    language: 'en',
    tone: 'professional',
    wordCount: 260,
    concurrency: 2,
    extraInstructions: '',
    demoMode: false,
  });

  // Preselection from the targets table and the pipelines list, so "run these"
  // lands in the wizard already filled in rather than starting from nothing.
  React.useEffect(() => {
    const fromQuery = searchParams.get('targets');
    if (fromQuery) setSelectedTargets(fromQuery.split(',').filter(Boolean));
    const pipelineFromQuery = searchParams.get('pipeline');
    if (pipelineFromQuery) setPipelineId(pipelineFromQuery);
  }, [searchParams]);

  React.useEffect(() => {
    if (!profileId && profiles?.length) setProfileId(profiles[0].id);
  }, [profiles, profileId]);

  React.useEffect(() => {
    if (!pipelineId && pipelines?.length) setPipelineId(pipelines[0].id);
  }, [pipelines, pipelineId]);

  // Seeded once. SWR revalidates on window focus, and without this guard
  // switching tabs and back would silently revert every choice made on the
  // options step to the account defaults.
  const seededFromSettings = React.useRef(false);

  React.useEffect(() => {
    if (!settings || seededFromSettings.current) return;
    seededFromSettings.current = true;

    setOptions((current) => ({
      ...current,
      language: settings.defaultLanguage,
      tone: settings.defaultTone,
      wordCount: settings.defaultWordCount,
      concurrency: settings.defaultConcurrency,
    }));
  }, [settings]);

  const profile = profiles?.find((p) => p.id === profileId);
  const pipeline = pipelines?.find((p) => p.id === pipelineId);
  const chosenTargets = (targets ?? []).filter((t) => selectedTargets.includes(t.id));
  const pipelineErrors = pipeline?.issues?.filter((i) => i.level === 'error') ?? [];

  const filteredTargets = React.useMemo(() => {
    if (!targets) return [];
    const term = search.trim().toLowerCase();
    if (!term) return targets;
    return targets.filter((t) =>
      [t.name, t.organization, t.country, t.kind, ...t.tags, ...t.focusAreas].join(' ').toLowerCase().includes(term),
    );
  }, [targets, search]);

  const stepValid = [
    Boolean(profileId),
    selectedTargets.length > 0,
    Boolean(pipelineId) && pipelineErrors.length === 0,
    true,
    true,
  ];

  const canContinue = stepValid[stepIndex];

  const activeSteps = pipeline?.steps.filter((s) => s.enabled) ?? [];
  const usesWebSearch = activeSteps.some((s) => s.prompt?.webSearch);
  const modelCalls = chosenTargets.length * activeSteps.length;
  // A deliberately rough figure. Labelled an estimate everywhere it appears so
  // nobody reads it as a quote.
  const estimatedTokens = modelCalls * (usesWebSearch ? 9000 : 4500);
  const estimatedCost = (estimatedTokens / 1_000_000) * 3;
  // Hosted, the key lives in this browser, so that is what decides whether a
  // run can be real — not anything the server knows.
  const demoActive = options.demoMode || (CLOUD_MODE ? !keyState.present : Boolean(settings?.demoModeActive));

  const launch = async () => {
    setLaunching(true);
    try {
      const run = await api.post<Run>('/api/runs', {
        profileId,
        pipelineId,
        targetIds: selectedTargets,
        options,
      });
      toast.success('Run started', `${chosenTargets.length} target${chosenTargets.length === 1 ? '' : 's'} queued.`);
      router.push(`/runs/${run.id}`);
    } catch (err) {
      toast.error('Could not start the run', err instanceof ApiError ? err.message : 'Unexpected error');
      setLaunching(false);
    }
  };

  if (!profiles || !targets || !pipelines) {
    return (
      <PageBody>
        <Panel>
          <LoadingBlock label="Preparing" />
        </Panel>
      </PageBody>
    );
  }

  if (!profiles.length || !targets.length) {
    return (
      <>
        <PageHeader title="New run" description="You need an applicant and at least one target before a run can start." />
        <PageBody>
          <Panel className="p-8 text-center">
            <h2 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">
              {!profiles.length ? 'Create an applicant profile first' : 'Add some targets first'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
              {!profiles.length
                ? 'Every draft is built from the applicant profile, so the system needs one before it can write anything.'
                : 'A run processes a list of targets. Add at least one professor, programme, or scholarship.'}
            </p>
            <Button asChild variant="primary" className="mt-5">
              <Link href={!profiles.length ? '/applicants' : '/targets'}>
                {!profiles.length ? 'Go to applicants' : 'Go to targets'}
                <ChevronRight />
              </Link>
            </Button>
          </Panel>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New run"
        description="Five steps. Nothing is sent and nothing is charged until you launch on the last one."
      />

      <PageBody>
        {/* The stepper. Numbers earn their place here: this is a real sequence. */}
        <nav aria-label="Progress" className="mb-6">
          <ol className="scroll-x flex items-center gap-1">
            {STEPS.map((step, index) => {
              const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'upcoming';
              const reachable = index <= stepIndex || stepValid.slice(0, index).every(Boolean);

              return (
                <li key={step.key} className="flex flex-1 items-center gap-1">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => reachable && setStepIndex(index)}
                    aria-current={state === 'current' ? 'step' : undefined}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-left transition-colors duration-[120ms]',
                      state === 'current' && 'bg-[var(--color-accent-soft)]',
                      state !== 'current' && reachable && 'hover:bg-[var(--color-surface-sunken)]',
                      !reachable && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-medium',
                        state === 'done' && 'bg-[var(--color-signal)] text-white',
                        state === 'current' && 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]',
                        state === 'upcoming' && 'border border-[var(--color-border-strong)] text-[var(--color-text-faint)]',
                      )}
                    >
                      {state === 'done' ? <Check className="size-3.5" /> : index + 1}
                    </span>

                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block truncate text-[0.8125rem] font-medium',
                          state === 'current' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]',
                        )}
                      >
                        {step.label}
                      </span>
                      <span className="hidden truncate text-[0.6875rem] text-[var(--color-text-faint)] lg:block">
                        {step.blurb}
                      </span>
                    </span>
                  </button>

                  {index < STEPS.length - 1 && (
                    <span className="hidden h-px w-4 shrink-0 bg-[var(--color-border)] sm:block" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel className="min-h-[26rem] p-5">
            {/* ---------------------------------------------------- 1. applicant */}
            {stepIndex === 0 && (
              <section className="space-y-4">
                <StepIntro
                  title="Who is applying?"
                  body="Everything the system writes comes from this profile. A fuller profile produces a more specific message."
                />

                <div className="space-y-2">
                  {profiles.map((option) => (
                    <label
                      key={option.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-4 py-3 transition-colors',
                        profileId === option.id
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)]',
                      )}
                    >
                      <input
                        type="radio"
                        name="profile"
                        checked={profileId === option.id}
                        onChange={() => setProfileId(option.id)}
                        className="mt-1 accent-[var(--color-accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[0.875rem] font-medium text-[var(--color-text)]">{option.fullName}</span>
                          <Badge tone={option.completeness.percent >= 70 ? 'positive' : 'warning'}>
                            {option.completeness.percent}% complete
                          </Badge>
                        </div>
                        {option.headline && (
                          <p className="mt-0.5 text-[0.8125rem] text-[var(--color-text-muted)]">{option.headline}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {profile && profile.completeness.percent < 60 && (
                  <Notice
                    tone="warning"
                    icon={<AlertTriangle />}
                    title="This profile is thin"
                    action={
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/applicants/${profile.id}`}>Improve it</Link>
                      </Button>
                    }
                  >
                    Missing: {profile.completeness.missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(', ')}. The run
                    will work, but the drafts will read generically.
                  </Notice>
                )}
              </section>
            )}

            {/* ------------------------------------------------------ 2. targets */}
            {stepIndex === 1 && (
              <section className="space-y-4">
                <StepIntro
                  title="Who are you writing to?"
                  body="Pick as many as you like. Each one is researched and drafted independently."
                />

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[13rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter targets"
                      aria-label="Filter targets"
                      className="pl-9"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTargets(filteredTargets.map((t) => t.id))}
                  >
                    Select all {search && 'shown'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTargets([])} disabled={!selectedTargets.length}>
                    Clear
                  </Button>
                </div>

                <div className="max-h-[26rem] overflow-y-auto rounded-[var(--radius-control)] border border-[var(--color-border)]">
                  {filteredTargets.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[0.8125rem] text-[var(--color-text-faint)]">
                      Nothing matches that filter.
                    </p>
                  ) : (
                    filteredTargets.map((target) => (
                      <label
                        key={target.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 border-b border-[var(--color-border)] px-4 py-2.5 transition-colors last:border-b-0',
                          selectedTargets.includes(target.id)
                            ? 'bg-[var(--color-accent-soft)]'
                            : 'hover:bg-[var(--color-surface-sunken)]',
                        )}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={selectedTargets.includes(target.id)}
                          onChange={() =>
                            setSelectedTargets((current) =>
                              current.includes(target.id) ? current.filter((x) => x !== target.id) : [...current, target.id],
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[0.8125rem] font-medium text-[var(--color-text)]">{target.name}</span>
                            <Badge tone="neutral">{target.kind}</Badge>
                          </div>
                          <p className="truncate text-[0.6875rem] text-[var(--color-text-muted)]">
                            {[target.organization, target.country].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>

                <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
                  {selectedTargets.length} selected of {targets.length}
                </p>
              </section>
            )}

            {/* ----------------------------------------------------- 3. pipeline */}
            {stepIndex === 2 && (
              <section className="space-y-4">
                <StepIntro
                  title="What should happen to each one?"
                  body="A pipeline is an ordered set of steps. Every step feeds the next."
                />

                <div className="space-y-3">
                  {pipelines.map((option) => {
                    const errors = option.issues?.filter((i) => i.level === 'error') ?? [];
                    const steps = option.steps.filter((s) => s.enabled);
                    const web = steps.some((s) => s.prompt?.webSearch);

                    return (
                      <label
                        key={option.id}
                        className={cn(
                          'block cursor-pointer rounded-[var(--radius-control)] border px-4 py-3 transition-colors',
                          pipelineId === option.id
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                            : 'border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)]',
                          errors.length > 0 && 'opacity-60',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="pipeline"
                            checked={pipelineId === option.id}
                            disabled={errors.length > 0}
                            onChange={() => setPipelineId(option.id)}
                            className="mt-1 accent-[var(--color-accent)]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[0.875rem] font-medium text-[var(--color-text)]">{option.name}</span>
                              <Badge tone="neutral">
                                {steps.length} step{steps.length === 1 ? '' : 's'}
                              </Badge>
                              {web && (
                                <Badge tone="accent">
                                  <Globe className="size-2.5" />
                                  Web search
                                </Badge>
                              )}
                              {errors.length > 0 && <Badge tone="negative">Needs fixing</Badge>}
                            </div>

                            <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
                              {option.description}
                            </p>

                            <ol className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1">
                              {steps.map((step, index) => (
                                <li key={step.id} className="text-[0.6875rem] text-[var(--color-text-faint)]">
                                  {index + 1}. {step.title}
                                  {index < steps.length - 1 && ' →'}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {pipelineErrors.length > 0 && (
                  <Notice tone="negative" title="This pipeline cannot run">
                    {pipelineErrors[0].message}{' '}
                    <Link href={`/pipelines/${pipelineId}`} className="underline">
                      Fix it
                    </Link>
                  </Notice>
                )}
              </section>
            )}

            {/* ------------------------------------------------------ 4. options */}
            {stepIndex === 3 && (
              <section className="space-y-5">
                <StepIntro
                  title="How should the messages read?"
                  body="These apply to the whole run. Individual targets can carry their own language, which takes priority."
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Language" hint="What the drafts are written in.">
                    {({ id }) => (
                      <Select id={id} value={options.language} onChange={(e) => setOptions({ ...options, language: e.target.value })}>
                        {(meta?.languages ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>

                  <Field
                    label="Tone"
                    hint={meta?.tones.find((t) => t.value === options.tone)?.hint}
                  >
                    {({ id }) => (
                      <Select id={id} value={options.tone} onChange={(e) => setOptions({ ...options, tone: e.target.value })}>
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
                  <Field label="Target length" hint="Roughly how many words the message should be.">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="number"
                        min={80}
                        max={1200}
                        step={10}
                        value={options.wordCount}
                        onChange={(e) => setOptions({ ...options, wordCount: Number(e.target.value) })}
                      />
                    )}
                  </Field>

                  <Field
                    label="Targets at once"
                    hint="Higher is faster but more likely to hit a rate limit."
                  >
                    {({ id }) => (
                      <Select
                        id={id}
                        value={String(options.concurrency)}
                        onChange={(e) => setOptions({ ...options, concurrency: Number(e.target.value) })}
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

                <Field
                  label="Extra instructions"
                  hint="Applied to this run only. Useful for a one-off constraint, like mentioning a specific deadline."
                >
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={3}
                      value={options.extraInstructions}
                      onChange={(e) => setOptions({ ...options, extraInstructions: e.target.value })}
                      placeholder="e.g. Mention that I can start in January if that suits them better."
                    />
                  )}
                </Field>

                <div className="border-t border-[var(--color-border)]">
                  <SwitchRow
                    label="Demo mode"
                    hint="Produce representative output without calling a model. Nothing is researched and nothing is charged."
                    checked={demoActive}
                    disabled={CLOUD_MODE ? !keyState.present : settings?.demoModeActive && !settings.apiKey.present}
                    onCheckedChange={(value) => setOptions({ ...options, demoMode: value })}
                  />
                </div>

                {CLOUD_MODE && !keyState.present && (
                  <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
                    <ApiKeyCard compact />
                  </div>
                )}

                {!CLOUD_MODE && settings && !settings.apiKey.present && (
                  <Notice tone="warning" icon={<CircleDot />}>
                    No API key is configured, so this run will be a demo whatever you choose here.{' '}
                    <Link href="/settings" className="underline">
                      Add a key
                    </Link>
                    .
                  </Notice>
                )}
              </section>
            )}

            {/* ------------------------------------------------------- 5. review */}
            {stepIndex === 4 && (
              <section className="space-y-5">
                <StepIntro title="Ready to go" body="Check this over. Launching starts work immediately." />

                <dl className="divide-y divide-[var(--color-border)] rounded-[var(--radius-control)] border border-[var(--color-border)]">
                  <ReviewRow label="Applicant" value={profile?.fullName ?? '—'} href={`/applicants/${profileId}`} />
                  <ReviewRow
                    label="Targets"
                    value={`${chosenTargets.length} selected`}
                    detail={truncate(chosenTargets.map((t) => t.name).join(', '), 130)}
                  />
                  <ReviewRow label="Pipeline" value={pipeline?.name ?? '—'} detail={`${activeSteps.length} steps per target`} />
                  <ReviewRow
                    label="Message settings"
                    value={`${meta?.languages.find((l) => l.value === options.language)?.label ?? options.language}, ${options.tone}`}
                    detail={`about ${options.wordCount} words`}
                  />
                  <ReviewRow label="Concurrency" value={`${options.concurrency} at a time`} />
                </dl>

                <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
                  <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">What this will do</p>
                  <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-[var(--color-text-muted)]">
                    <li>
                      {formatNumber(modelCalls)} model call{modelCalls === 1 ? '' : 's'} in total —{' '}
                      {chosenTargets.length} target{chosenTargets.length === 1 ? '' : 's'} × {activeSteps.length} step
                      {activeSteps.length === 1 ? '' : 's'}
                    </li>
                    {usesWebSearch && <li>Includes web search, so expect minutes rather than seconds per target</li>}
                    {demoActive ? (
                      <li className="text-[var(--color-amber)]">Demo mode: nothing is researched and nothing is charged</li>
                    ) : (
                      <li>
                        Very roughly {formatNumber(estimatedTokens)} tokens, around {formatCost(estimatedCost)} — an
                        estimate only, and real usage varies a lot
                      </li>
                    )}
                  </ul>
                </div>

                {CLOUD_MODE && !demoActive && (
                  <Notice tone="neutral" icon={<CircleDot />} title="Keep this tab open">
                    The run is orchestrated by this tab, so closing it stops the work. Everything finished up to that
                    point is already saved.
                  </Notice>
                )}

                {!demoActive && chosenTargets.length > 20 && (
                  <Notice tone="warning" icon={<AlertTriangle />} title="That is a large run">
                    {chosenTargets.length} targets will take a while and cost real money. Consider running a couple first to
                    check the drafts read the way you want.
                  </Notice>
                )}
              </section>
            )}

            <div className="mt-8 flex items-center justify-between border-t border-[var(--color-border)] pt-5">
              <Button variant="ghost" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
                <ChevronLeft />
                Back
              </Button>

              {stepIndex < STEPS.length - 1 ? (
                <Button variant="primary" onClick={() => setStepIndex((i) => i + 1)} disabled={!canContinue}>
                  Continue
                  <ChevronRight />
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={launch} loading={launching}>
                  <PlayCircle />
                  Launch run
                </Button>
              )}
            </div>
          </Panel>

          {/* The decisions so far, always visible. */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Panel>
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-[0.8125rem] font-semibold text-[var(--color-text)]">This run</h2>
              </div>

              <div className="space-y-3 px-4 py-3.5 text-[0.8125rem]">
                <SummaryLine label="Applicant" value={profile?.fullName} />
                <SummaryLine label="Targets" value={selectedTargets.length ? `${selectedTargets.length} selected` : undefined} />
                <SummaryLine label="Pipeline" value={pipeline?.name} />
                <SummaryLine
                  label="Language"
                  value={stepIndex >= 3 ? meta?.languages.find((l) => l.value === options.language)?.label : undefined}
                />
                <SummaryLine label="Tone" value={stepIndex >= 3 ? options.tone : undefined} />
              </div>

              {selectedTargets.length > 0 && pipeline && (
                <div className="border-t border-[var(--color-border)] px-4 py-3.5">
                  <p className="text-[0.6875rem] text-[var(--color-text-faint)]">Model calls</p>
                  <p className="mt-0.5 font-[family-name:var(--font-display)] text-[1.375rem] leading-none text-[var(--color-text)]">
                    {formatNumber(modelCalls)}
                  </p>
                  {demoActive ? (
                    <Badge tone="warning" className="mt-2">
                      Demo mode
                    </Badge>
                  ) : (
                    <p className="mt-1.5 text-[0.6875rem] text-[var(--color-text-faint)]">
                      around {formatCost(estimatedCost)} estimated
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-[var(--color-border)] px-4 py-3">
                <Progress value={((stepIndex + 1) / STEPS.length) * 100} />
                <p className="mt-1.5 text-[0.6875rem] text-[var(--color-text-faint)]">
                  Step {stepIndex + 1} of {STEPS.length}
                </p>
              </div>
            </Panel>
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-[1.0625rem] text-[var(--color-text)]">{title}</h2>
      <p className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">{body}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={cn('truncate text-right', value ? 'text-[var(--color-text)]' : 'text-[var(--color-text-faint)]')}>
        {value ?? 'Not chosen'}
      </span>
    </div>
  );
}

function ReviewRow({ label, value, detail, href }: { label: string; value: string; detail?: string; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[0.8125rem] text-[var(--color-text-muted)]">{label}</dt>
      <dd className="min-w-0 text-right">
        {href ? (
          <Link href={href} className="text-[0.8125rem] font-medium text-[var(--color-accent)] hover:underline">
            {value}
          </Link>
        ) : (
          <span className="text-[0.8125rem] font-medium text-[var(--color-text)]">{value}</span>
        )}
        {detail && <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-[var(--color-text-faint)]">{detail}</p>}
      </dd>
    </div>
  );
}
