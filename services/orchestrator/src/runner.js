import { httpJson } from '@flow/service-kit';
import {
  serviceUrl,
  getErrorMessage,
  profileToPromptBlock,
  targetToPromptBlock,
  AppError,
} from '@flow/shared';

/**
 * Executes a run: for every target, walk the pipeline steps in order, feeding
 * each step's output into the context the next step renders against.
 *
 * Failure policy is per-target, not per-run. One professor with a dead website
 * must not cost the applicant the other forty drafts, so a target that throws
 * is recorded and the pool moves on. The run only stops early if failures pile
 * up, which usually means a bad key or an unreachable model rather than bad
 * data.
 */

/**
 * Builds the context object every template renders against.
 * @param {{ profile: any, target: any, options: any, stepOutputs: Record<string, unknown> }} args
 */
function buildContext({ profile, target, options, stepOutputs }) {
  return {
    today: new Date().toISOString().slice(0, 10),
    applicant: {
      ...profile,
      // `block` is the pre-rendered summary most prompts interpolate wholesale.
      block: profileToPromptBlock(profile),
      name: profile.fullName,
      researchInterests: profile.researchInterests.join(', '),
      targetCountries: profile.targetCountries.join(', '),
      skills: profile.skills.join(', '),
    },
    target: {
      ...target,
      block: targetToPromptBlock(target),
      focusAreas: target.focusAreas.join(', '),
    },
    options,
    steps: stepOutputs,
  };
}

/**
 * A bounded worker pool. Written inline rather than pulled in as a dependency
 * because it is fifteen lines and the failure semantics need to be exact.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<void>} worker
 */
async function pool(items, limit, worker) {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

/**
 * @param {{
 *   run: any,
 *   profile: any,
 *   targets: any[],
 *   plan: { steps: any[] },
 *   signal: AbortSignal,
 *   logger: { info: (m: string) => void, warn: (m: string) => void, error: (m: string, e?: unknown) => void },
 *   onEvent: (event: { level?: string, type: string, message: string, targetId?: string | null, stepKey?: string | null }) => void,
 *   onItemChange: (targetId: string, updater: (item: any) => any) => Promise<void>
 * }} args
 */
export async function executeRun({ run, profile, targets, plan, signal, logger, onEvent, onItemChange }) {
  const options = run.options;
  let consecutiveFailures = 0;
  let stopped = false;

  onEvent({
    type: 'run.started',
    level: 'info',
    message: `Starting ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} across ${targets.length} target${targets.length === 1 ? '' : 's'}${options.demoMode ? ' in demo mode' : ''}.`,
  });

  await pool(targets, options.concurrency, async (target) => {
    if (signal.aborted || stopped) {
      await onItemChange(target.id, (item) => ({ ...item, status: 'skipped' }));
      return;
    }

    const targetStarted = Date.now();
    await onItemChange(target.id, (item) => ({ ...item, status: 'running', startedAt: new Date().toISOString() }));
    onEvent({ type: 'target.started', level: 'info', message: `Working on ${target.name}`, targetId: target.id });

    /** @type {Record<string, unknown>} */
    const stepOutputs = {};
    let targetFailed = false;

    for (const step of plan.steps) {
      if (signal.aborted) {
        await onItemChange(target.id, (item) => ({
          ...item,
          steps: item.steps.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' } : s)),
        }));
        break;
      }

      const stepStarted = Date.now();
      await onItemChange(target.id, (item) => ({
        ...item,
        steps: item.steps.map((s) =>
          s.key === step.key ? { ...s, status: 'running', startedAt: new Date().toISOString() } : s,
        ),
      }));
      onEvent({ type: 'step.started', level: 'info', message: step.title, targetId: target.id, stepKey: step.key });

      try {
        const context = buildContext({ profile, target, options, stepOutputs });

        const response = await httpJson(`${serviceUrl(step.service)}/execute`, {
          method: 'POST',
          serviceName: step.service,
          // Web-search research legitimately runs for minutes; a short timeout
          // here would look like a failure when the model is still working.
          timeoutMs: step.config?.webSearch ? 600_000 : 240_000,
          retries: 0,
          signal,
          body: {
            step,
            context,
            runtime: { demoMode: options.demoMode },
          },
        });

        if (!response?.success) {
          throw new AppError(response?.error ?? `The ${step.service} service rejected the request.`, 502);
        }

        const data = response.data;
        stepOutputs[step.key] = data.output;

        await onItemChange(target.id, (item) => ({
          ...item,
          steps: item.steps.map((s) =>
            s.key === step.key
              ? {
                  ...s,
                  status: 'succeeded',
                  finishedAt: new Date().toISOString(),
                  durationMs: Date.now() - stepStarted,
                  usage: data.usage ?? null,
                  output: data.output ?? null,
                  missingVariables: data.missingVariables ?? [],
                  error: null,
                }
              : s,
          ),
        }));

        if (data.missingVariables?.length) {
          onEvent({
            type: 'step.warning',
            level: 'warning',
            message: `${step.title}: ${data.missingVariables.length} variable${data.missingVariables.length === 1 ? '' : 's'} resolved to nothing (${data.missingVariables.join(', ')}). The output may be thinner than expected.`,
            targetId: target.id,
            stepKey: step.key,
          });
        }

        onEvent({
          type: 'step.finished',
          level: 'success',
          message: `${step.title} finished in ${((Date.now() - stepStarted) / 1000).toFixed(1)}s`,
          targetId: target.id,
          stepKey: step.key,
        });
      } catch (error) {
        const message = getErrorMessage(error);

        await onItemChange(target.id, (item) => ({
          ...item,
          steps: item.steps.map((s) =>
            s.key === step.key
              ? { ...s, status: 'failed', finishedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted, error: message }
              : s,
          ),
        }));

        // An optional step that fails is a warning; the run keeps its shape and
        // later steps still have everything the required steps produced.
        if (step.optional) {
          onEvent({
            type: 'step.skipped',
            level: 'warning',
            message: `${step.title} failed but is optional, so the run continued. ${message}`,
            targetId: target.id,
            stepKey: step.key,
          });
          continue;
        }

        targetFailed = true;
        onEvent({ type: 'step.failed', level: 'error', message: `${step.title} failed: ${message}`, targetId: target.id, stepKey: step.key });

        await onItemChange(target.id, (item) => ({
          ...item,
          steps: item.steps.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' } : s)),
          error: message,
        }));
        break;
      }
    }

    const finishedAt = new Date().toISOString();
    const status = signal.aborted ? 'skipped' : targetFailed ? 'failed' : 'succeeded';

    await onItemChange(target.id, (item) => ({
      ...item,
      status,
      finishedAt,
      durationMs: Date.now() - targetStarted,
    }));

    if (status === 'failed') {
      consecutiveFailures += 1;
      onEvent({ type: 'target.failed', level: 'error', message: `${target.name} did not finish.`, targetId: target.id });

      if (consecutiveFailures >= options.stopAfterFailures) {
        stopped = true;
        onEvent({
          type: 'run.halted',
          level: 'error',
          message: `Stopped after ${consecutiveFailures} targets failed in a row. This usually means the API key, the model, or the network is the problem rather than the targets.`,
        });
      }
    } else if (status === 'succeeded') {
      consecutiveFailures = 0;
      onEvent({ type: 'target.finished', level: 'success', message: `${target.name} is done.`, targetId: target.id });
    }
  });

  return { halted: stopped };
}
