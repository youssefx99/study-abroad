import {
  createId,
  profileSchema,
  targetSchema,
  runSchema,
  runOptionsSchema,
  summariseRun,
  settingsSchema,
  profileToPromptBlock,
  targetToPromptBlock,
  renderTemplate,
} from '@flow/shared';
import { generateDemoOutput } from '@flow/llm/demo';
import { readList, writeList, read } from './store';
import { buildPlan, LocalApiError } from './local-api';
import { getApiKey } from './api-key';
import type { Run, RunItem, RunStep } from '@/lib/types';

/**
 * Runs a pipeline in the browser.
 *
 * On a serverless deployment there is nowhere to keep a run in flight: each
 * function invocation is isolated and short-lived, so an orchestrator process
 * and a server-sent event stream have nothing to live in. The tab that started
 * the run is the only thing with continuity, so it does the orchestrating and
 * calls the stateless `/api/execute` route once per step.
 *
 * The consequence is worth stating plainly, because it changes what people can
 * expect: closing the tab stops the run. Everything finished up to that point
 * is already saved.
 */

type Listener = (run: Run) => void;

interface ActiveRun {
  run: Run;
  controller: AbortController;
  listeners: Set<Listener>;
}

/** Runs in flight, keyed by id. Empty after a reload, by nature. */
const active = new Map<string, ActiveRun>();

const now = () => new Date().toISOString();

export function isRunActive(runId: string): boolean {
  return active.has(runId);
}

/** Subscribes to a run in flight. Returns an unsubscribe function. */
export function subscribeToLocalRun(runId: string, listener: Listener): () => void {
  const entry = active.get(runId);
  if (!entry) return () => undefined;

  entry.listeners.add(listener);
  listener(entry.run);

  return () => {
    entry.listeners.delete(listener);
  };
}

export function cancelLocalRun(runId: string): boolean {
  const entry = active.get(runId);
  if (!entry) return false;
  entry.controller.abort();
  return true;
}

function persist(run: Run): void {
  const rows = readList<Run>('runs');
  const index = rows.findIndex((r) => r.id === run.id);
  const next = index === -1 ? [run, ...rows] : rows.map((r) => (r.id === run.id ? run : r));

  // Runs are by far the largest records, and browser storage is finite. Keeping
  // the most recent 40 means a heavy user hits a predictable ceiling rather
  // than an opaque quota error mid-run.
  writeList('runs', next.slice(0, 40));
}

function emit(entry: ActiveRun, mutate: (run: Run) => Run): void {
  entry.run = mutate(entry.run);
  entry.run = { ...entry.run, summary: summariseRun(entry.run) } as Run;
  persist(entry.run);
  for (const listener of entry.listeners) listener(entry.run);
}

function addEvent(run: Run, level: 'info' | 'success' | 'warning' | 'error', message: string, targetId?: string, stepKey?: string): Run {
  return {
    ...run,
    events: [...run.events, { at: now(), level, type: 'log', message, targetId: targetId ?? null, stepKey: stepKey ?? null }].slice(-400),
  };
}

/** Bounded worker pool, matching the orchestrator's semantics. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        await worker(items[index]);
      }
    }),
  );
}

/** Builds the context every template renders against. Mirrors the runner. */
function buildContext(profile: ReturnType<typeof profileSchema.parse>, target: ReturnType<typeof targetSchema.parse>, options: Record<string, unknown>, stepOutputs: Record<string, unknown>) {
  return {
    today: new Date().toISOString().slice(0, 10),
    applicant: {
      ...profile,
      block: profileToPromptBlock(profile),
      name: profile.fullName,
      researchInterests: profile.researchInterests.join(', '),
      targetCountries: profile.targetCountries.join(', '),
      skills: profile.skills.join(', '),
    },
    target: { ...target, block: targetToPromptBlock(target), focusAreas: target.focusAreas.join(', ') },
    options,
    steps: stepOutputs,
  };
}

export interface StartRunInput {
  profileId: string;
  pipelineId: string;
  targetIds: string[];
  label?: string;
  options?: Record<string, unknown>;
}

/**
 * Creates a run and starts executing it. Returns as soon as the record exists,
 * so the caller can navigate to the console.
 */
export function startLocalRun(input: StartRunInput): Run {
  const profiles = readList<unknown>('profiles').map((r) => profileSchema.parse(r));
  const targetRows = readList<unknown>('targets').map((r) => targetSchema.parse(r));
  const stored = settingsSchema.parse(read('settings', {}));

  const profile = profiles.find((p) => p.id === input.profileId);
  if (!profile) throw new LocalApiError(`Applicant "${input.profileId}" was not found`, 404);

  const plan = buildPlan(input.pipelineId);
  const targets = input.targetIds.map((id) => targetRows.find((t) => t.id === id)).filter(Boolean) as typeof targetRows;
  if (!targets.length) throw new LocalApiError('None of the selected targets could be loaded.', 422);

  const hasKey = Boolean(getApiKey());

  const options = runOptionsSchema.parse({
    concurrency: stored.defaultConcurrency,
    language: stored.defaultLanguage,
    tone: stored.defaultTone,
    wordCount: stored.defaultWordCount,
    ...(input.options ?? {}),
    // Without a key there is nothing to call, so a run would otherwise produce
    // a wall of identical auth errors. Demo mode at least stays useful.
    demoMode: Boolean((input.options ?? {}).demoMode) || stored.demoMode || !hasKey,
  });

  const run = runSchema.parse({
    id: createId('run'),
    createdAt: now(),
    label: input.label ?? `${plan.pipeline.name} · ${targets.length} target${targets.length === 1 ? '' : 's'}`,
    profileId: profile.id,
    profileName: profile.fullName,
    pipelineId: input.pipelineId,
    pipelineName: plan.pipeline.name,
    targetIds: targets.map((t) => t.id),
    status: 'queued',
    options,
    items: targets.map((target) => ({
      targetId: target.id,
      targetName: target.name,
      status: 'pending',
      steps: plan.steps.map((step) => ({
        key: step.key,
        title: step.title,
        service: step.service,
        promptKey: step.promptKey,
        promptVersion: step.promptVersion,
        status: 'pending',
      })),
    })),
    events: [],
  }) as Run;

  const entry: ActiveRun = { run: { ...run, summary: summariseRun(run) } as Run, controller: new AbortController(), listeners: new Set() };
  active.set(run.id, entry);
  persist(entry.run);

  void execute(entry, profile, targets, plan);

  return entry.run;
}

async function execute(
  entry: ActiveRun,
  profile: ReturnType<typeof profileSchema.parse>,
  targets: ReturnType<typeof targetSchema.parse>[],
  plan: ReturnType<typeof buildPlan>,
): Promise<void> {
  const { options } = entry.run;
  const apiKey = getApiKey();
  let consecutiveFailures = 0;
  let halted = false;

  emit(entry, (run) =>
    addEvent(
      { ...run, status: 'running', startedAt: now() },
      'info',
      `Starting ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} across ${targets.length} target${targets.length === 1 ? '' : 's'}${options.demoMode ? ' in demo mode' : ''}.`,
    ),
  );

  const patchItem = (targetId: string, mutate: (item: RunItem) => RunItem) => {
    emit(entry, (run) => ({ ...run, items: run.items.map((item) => (item.targetId === targetId ? mutate(item) : item)) }));
  };

  const patchStep = (targetId: string, stepKey: string, mutate: (step: RunStep) => RunStep) => {
    patchItem(targetId, (item) => ({ ...item, steps: item.steps.map((s) => (s.key === stepKey ? mutate(s) : s)) }));
  };

  await pool(targets, options.concurrency, async (target) => {
    if (entry.controller.signal.aborted || halted) {
      patchItem(target.id, (item) => ({ ...item, status: 'skipped' }));
      return;
    }

    const targetStarted = Date.now();
    patchItem(target.id, (item) => ({ ...item, status: 'running', startedAt: now() }));
    emit(entry, (run) => addEvent(run, 'info', `Working on ${target.name}`, target.id));

    const stepOutputs: Record<string, unknown> = {};
    let targetFailed = false;

    for (const step of plan.steps) {
      if (entry.controller.signal.aborted) {
        patchItem(target.id, (item) => ({
          ...item,
          steps: item.steps.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' } : s)),
        }));
        break;
      }

      const stepStarted = Date.now();
      patchStep(target.id, step.key, (s) => ({ ...s, status: 'running', startedAt: now() }));

      try {
        const context = buildContext(profile, target, options as unknown as Record<string, unknown>, stepOutputs);
        const system = renderTemplate(step.systemPrompt ?? '', context);
        const user = renderTemplate(step.userPrompt, context);
        const missingVariables = [...new Set([...system.missing, ...user.missing])];

        let output: unknown;
        let usage: RunStep['usage'];

        if (options.demoMode) {
          // Produced here rather than on the server: it needs no key, no
          // network, and no function invocation to bill for.
          await new Promise((resolve) => setTimeout(resolve, 280 + Math.random() * 420));
          output = generateDemoOutput({
            outputSchema: step.outputSchema,
            userPrompt: user.text,
            seed: `${target.id}:${step.key}`,
            hints: {
              targetName: target.name,
              organization: target.organization,
              applicantName: profile.fullName,
              focus: target.focusAreas.join(', '),
            },
          });
          const text = JSON.stringify(output);
          usage = {
            promptTokens: Math.round((system.text.length + user.text.length) / 4),
            completionTokens: Math.round(text.length / 4),
            reasoningTokens: 0,
            totalTokens: Math.round((system.text.length + user.text.length + text.length) / 4),
            model: `${step.config.model} (demo)`,
          };
        } else {
          const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: entry.controller.signal,
            body: JSON.stringify({
              apiKey,
              step: {
                key: step.key,
                title: step.title,
                systemPrompt: system.text,
                userPrompt: user.text,
                outputSchema: step.outputSchema,
                config: step.config,
              },
            }),
          });

          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.success === false) {
            throw new Error(payload?.error ?? `The model route responded ${response.status}.`);
          }

          output = payload.data.output;
          usage = payload.data.usage;
        }

        stepOutputs[step.key] = output;

        patchStep(target.id, step.key, (s) => ({
          ...s,
          status: 'succeeded',
          finishedAt: now(),
          durationMs: Date.now() - stepStarted,
          usage,
          output,
          missingVariables,
          error: null,
        }));

        if (missingVariables.length) {
          emit(entry, (run) =>
            addEvent(
              run,
              'warning',
              `${step.title}: ${missingVariables.length} variable${missingVariables.length === 1 ? '' : 's'} resolved to nothing (${missingVariables.join(', ')}). The output may be thinner than expected.`,
              target.id,
              step.key,
            ),
          );
        }

        emit(entry, (run) =>
          addEvent(run, 'success', `${step.title} finished in ${((Date.now() - stepStarted) / 1000).toFixed(1)}s`, target.id, step.key),
        );
      } catch (error) {
        const message =
          entry.controller.signal.aborted
            ? 'Cancelled.'
            : error instanceof Error
              ? error.message
              : 'The step failed.';

        patchStep(target.id, step.key, (s) => ({
          ...s,
          status: 'failed',
          finishedAt: now(),
          durationMs: Date.now() - stepStarted,
          error: message,
        }));

        if (step.optional) {
          emit(entry, (run) =>
            addEvent(run, 'warning', `${step.title} failed but is optional, so the run continued. ${message}`, target.id, step.key),
          );
          continue;
        }

        targetFailed = true;
        emit(entry, (run) => addEvent(run, 'error', `${step.title} failed: ${message}`, target.id, step.key));
        patchItem(target.id, (item) => ({
          ...item,
          steps: item.steps.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' } : s)),
          error: message,
        }));
        break;
      }
    }

    const status = entry.controller.signal.aborted ? 'skipped' : targetFailed ? 'failed' : 'succeeded';
    patchItem(target.id, (item) => ({ ...item, status, finishedAt: now(), durationMs: Date.now() - targetStarted }));

    if (status === 'failed') {
      consecutiveFailures += 1;
      emit(entry, (run) => addEvent(run, 'error', `${target.name} did not finish.`, target.id));

      if (consecutiveFailures >= options.stopAfterFailures) {
        halted = true;
        emit(entry, (run) =>
          addEvent(
            run,
            'error',
            `Stopped after ${consecutiveFailures} targets failed in a row. That usually means the API key, the model, or the network is the problem rather than the targets.`,
          ),
        );
      }
    } else if (status === 'succeeded') {
      consecutiveFailures = 0;
      emit(entry, (run) => addEvent(run, 'success', `${target.name} is done.`, target.id));
    }
  });

  const succeeded = entry.run.items.filter((i) => i.status === 'succeeded').length;
  const failed = entry.run.items.filter((i) => i.status === 'failed').length;
  const status = entry.controller.signal.aborted
    ? 'cancelled'
    : failed === 0 && succeeded > 0
      ? 'completed'
      : succeeded > 0
        ? 'partial'
        : 'failed';

  emit(entry, (run) => {
    const summary = summariseRun(run);
    return addEvent(
      { ...run, status, finishedAt: now() },
      status === 'completed' ? 'success' : status === 'cancelled' ? 'warning' : 'error',
      status === 'cancelled'
        ? 'Run cancelled.'
        : `${summary.succeeded} of ${summary.targets} finished${summary.failed ? `, ${summary.failed} failed` : ''}. ${summary.totalTokens.toLocaleString('en-US')} tokens used.`,
    );
  });

  // Record the run against each target that finished, matching the orchestrator.
  const finishedIds = entry.run.items.filter((i) => i.status === 'succeeded').map((i) => i.targetId);
  if (finishedIds.length) {
    const rows = readList<unknown>('targets').map((r) => targetSchema.parse(r));
    writeList(
      'targets',
      rows.map((t) =>
        finishedIds.includes(t.id) ? { ...t, lastRunId: entry.run.id, lastRunAt: entry.run.finishedAt ?? now(), status: 'ready' } : t,
      ),
    );
  }

  active.delete(entry.run.id);
}
