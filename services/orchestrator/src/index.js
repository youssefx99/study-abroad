import 'dotenv/config';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createService, finaliseService, listen, route, httpJson } from '@flow/service-kit';
import { JsonRepository, JsonDocument, DATA_DIR } from '@flow/store';
import {
  ok,
  createId,
  AppError,
  NotFoundError,
  serviceUrl,
  getErrorMessage,
  runSchema,
  runInputSchema,
  runOptionsSchema,
  summariseRun,
  settingsSchema,
  settingsPatchSchema,
  apiKeyInputSchema,
  maskApiKey,
  profileSchema,
  targetSchema,
} from '@flow/shared';
import { executeRun } from './runner.js';

/**
 * Orchestrator. Owns runs, settings, and the API key.
 *
 * It is the only service that writes `data/secrets.json`; the stage services
 * read it locally so the key never travels between processes.
 */

const { app, logger } = createService({ name: 'orchestrator' });

const runs = new JsonRepository('runs');
const settingsStore = new JsonDocument('settings', settingsSchema.parse({}));
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');

/** Live progress fan-out. Runs are in-process, so an emitter is enough. */
const bus = new EventEmitter();
bus.setMaxListeners(0);

/** @type {Map<string, AbortController>} */
const active = new Map();

const now = () => new Date().toISOString();
/** @param {unknown} record */
const hydrate = (record) => runSchema.parse(record);

/**
 * Persisting on every step keeps a refreshed browser in sync with a run in
 * flight, and means a crash loses at most one step rather than the whole run.
 * @param {string} runId
 * @param {(run: any) => any} updater
 */
async function patchRun(runId, updater) {
  const updated = await runs.update(runId, (current) => runSchema.parse(updater(hydrate(current))));
  if (!updated) throw new NotFoundError('Run', runId);
  return updated;
}

/**
 * @param {string} runId
 * @param {{ type: string, message: string, level?: string, targetId?: string | null, stepKey?: string | null }} event
 */
async function emit(runId, event) {
  const record = {
    at: now(),
    level: event.level ?? 'info',
    type: event.type,
    message: event.message,
    targetId: event.targetId ?? null,
    stepKey: event.stepKey ?? null,
  };

  // Keep the tail bounded: a 200-target run would otherwise grow the store
  // without limit, and the console only ever shows the recent history.
  await patchRun(runId, (run) => ({ ...run, events: [...run.events, record].slice(-400) }));
  bus.emit(runId, { kind: 'event', event: record });
}

/**
 * @param {string} runId
 * @param {string} targetId
 * @param {(item: any) => any} updater
 */
async function patchItem(runId, targetId, updater) {
  const updated = await patchRun(runId, (run) => ({
    ...run,
    items: run.items.map((item) => (item.targetId === targetId ? updater(item) : item)),
  }));

  const item = updated.items.find((i) => i.targetId === targetId);
  bus.emit(runId, { kind: 'item', item, summary: summariseRun(updated) });
  return updated;
}

// --------------------------------------------------------------------------
// Settings and the API key
// --------------------------------------------------------------------------

/** @returns {Promise<string>} */
async function readStoredKey() {
  if (!existsSync(SECRETS_FILE)) return '';
  try {
    const parsed = JSON.parse(await readFile(SECRETS_FILE, 'utf-8'));
    return typeof parsed?.openaiApiKey === 'string' ? parsed.openaiApiKey : '';
  } catch {
    return '';
  }
}

/**
 * The key is never returned by any endpoint — only whether one exists, where it
 * came from, and a masked hint so the user can tell which key is stored.
 */
async function describeKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim() ?? '';
  const stored = await readStoredKey();
  const effective = fromEnv || stored;

  return {
    present: Boolean(effective),
    source: fromEnv ? 'environment' : stored ? 'settings' : 'none',
    hint: effective ? maskApiKey(effective) : '',
    // An env key cannot be changed from the UI; saying so avoids a confusing
    // "saved" message that changes nothing.
    editable: !fromEnv,
  };
}

app.get(
  '/settings',
  route(async (_req, res) => {
    const settings = await settingsStore.read();
    const apiKey = await describeKey();

    res.json(
      ok({
        ...settings,
        apiKey,
        demoModeActive: settings.demoMode || !apiKey.present,
        dataDir: DATA_DIR,
      }),
    );
  }),
);

app.patch(
  '/settings',
  route(async (req, res) => {
    const patch = settingsPatchSchema.parse(req.body ?? {});
    const updated = await settingsStore.update((current) =>
      settingsSchema.parse({ ...current, ...patch, updatedAt: now() }),
    );

    const apiKey = await describeKey();
    res.json(ok({ ...updated, apiKey, demoModeActive: updated.demoMode || !apiKey.present, dataDir: DATA_DIR }));
  }),
);

app.put(
  '/settings/api-key',
  route(async (req, res) => {
    if (process.env.OPENAI_API_KEY?.trim()) {
      throw new AppError('The API key is set by the environment, so it cannot be changed here. Edit your .env file instead.', 409);
    }

    const { apiKey } = apiKeyInputSchema.parse(req.body ?? {});

    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(SECRETS_FILE, JSON.stringify({ openaiApiKey: apiKey, updatedAt: now() }, null, 2), 'utf-8');

    logger.info('API key updated');
    res.json(ok(await describeKey()));
  }),
);

app.delete(
  '/settings/api-key',
  route(async (_req, res) => {
    if (process.env.OPENAI_API_KEY?.trim()) {
      throw new AppError('The API key comes from the environment. Remove it from your .env file to clear it.', 409);
    }

    if (existsSync(SECRETS_FILE)) {
      await writeFile(SECRETS_FILE, JSON.stringify({ openaiApiKey: '', updatedAt: now() }, null, 2), 'utf-8');
    }

    logger.info('API key cleared');
    res.json(ok(await describeKey()));
  }),
);

/**
 * Verifies the stored key with the cheapest possible live call, so the user
 * finds out the key is wrong on the settings page rather than forty targets
 * into a run.
 */
app.post(
  '/settings/api-key/test',
  route(async (_req, res) => {
    const { resolveApiKey, invalidateApiKeyCache } = await import('@flow/llm/secrets');
    invalidateApiKeyCache();
    const key = await resolveApiKey();

    if (!key) {
      res.json(ok({ ok: false, message: 'No API key is configured. Flow is running in demo mode.' }));
      return;
    }

    const settings = await settingsStore.read();

    try {
      const { runPrompt } = await import('@flow/llm');
      const result = await runPrompt({
        userPrompt: 'Reply with the single word: ready',
        config: { model: settings.analysisModel, temperature: null, reasoningEffort: null, maxOutputTokens: 16, webSearch: false },
        outputSchema: null,
        apiKey: key,
        demoMode: false,
        logger,
      });

      res.json(
        ok({
          ok: true,
          message: `The key works. "${settings.analysisModel}" answered in ${result.usage.totalTokens} tokens.`,
          model: settings.analysisModel,
        }),
      );
    } catch (error) {
      res.json(ok({ ok: false, message: getErrorMessage(error) }));
    }
  }),
);

// --------------------------------------------------------------------------
// Runs
// --------------------------------------------------------------------------

app.get(
  '/runs',
  route(async (req, res) => {
    const rows = (await runs.readAll()).map(hydrate);
    const profileId = String(req.query.profileId ?? '').trim();
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);

    const filtered = profileId ? rows.filter((r) => r.profileId === profileId) : rows;
    const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);

    res.json(
      ok(
        sorted.map((run) => ({
          id: run.id,
          label: run.label,
          status: run.status,
          createdAt: run.createdAt,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          profileId: run.profileId,
          profileName: run.profileName,
          pipelineName: run.pipelineName,
          options: run.options,
          summary: summariseRun(run),
        })),
        { total: filtered.length },
      ),
    );
  }),
);

app.get(
  '/runs/:id',
  route(async (req, res) => {
    const record = await runs.findById(req.params.id);
    if (!record) throw new NotFoundError('Run', req.params.id);

    const run = hydrate(record);
    res.json(ok({ ...run, summary: summariseRun(run), live: active.has(run.id) }));
  }),
);

/**
 * Creates a run and starts it in the background. The response returns as soon
 * as the record exists so the browser can navigate to the live console instead
 * of holding a request open for the length of the run.
 */
app.post(
  '/runs',
  route(async (req, res) => {
    const input = runInputSchema.parse(req.body ?? {});
    const settings = await settingsStore.read();

    const profileResponse = await httpJson(`${serviceUrl('profiles')}/profiles/${input.profileId}`, {
      serviceName: 'profiles',
    }).catch(() => null);
    if (!profileResponse?.success) throw new NotFoundError('Applicant', input.profileId);
    const profile = profileSchema.parse(profileResponse.data);

    const planResponse = await httpJson(`${serviceUrl('prompts')}/internal/plan/${input.pipelineId}`, {
      serviceName: 'prompts',
    });
    if (!planResponse?.success) throw new AppError(planResponse?.error ?? 'The pipeline could not be prepared.', 422);
    const plan = planResponse.data;

    /** @type {any[]} */
    const targets = [];
    for (const id of input.targetIds) {
      const response = await httpJson(`${serviceUrl('targets')}/targets/${id}`, { serviceName: 'targets' }).catch(() => null);
      if (response?.success) targets.push(targetSchema.parse(response.data));
    }
    if (!targets.length) throw new AppError('None of the selected targets could be loaded.', 422);

    const { present: hasKey } = await describeKey();

    const options = runOptionsSchema.parse({
      concurrency: settings.defaultConcurrency,
      language: settings.defaultLanguage,
      tone: settings.defaultTone,
      wordCount: settings.defaultWordCount,
      ...(input.options ?? {}),
      // Demo mode is forced when there is no key: a run that silently produced
      // nothing would be far more confusing than one labelled as a demo.
      demoMode: Boolean(input.options?.demoMode) || settings.demoMode || !hasKey,
    });

    const createdAt = now();
    const run = runSchema.parse({
      id: createId('run'),
      createdAt,
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
    });

    await runs.create(run);
    logger.info(`run ${run.id} queued: ${targets.length} targets x ${plan.steps.length} steps`);

    startRun(run, profile, targets, plan).catch((error) => {
      logger.error(`run ${run.id} crashed`, error);
    });

    res.status(201).json(ok({ ...run, summary: summariseRun(run) }));
  }),
);

/**
 * @param {any} run
 * @param {any} profile
 * @param {any[]} targets
 * @param {any} plan
 */
async function startRun(run, profile, targets, plan) {
  const controller = new AbortController();
  active.set(run.id, controller);

  await patchRun(run.id, (current) => ({ ...current, status: 'running', startedAt: now() }));
  bus.emit(run.id, { kind: 'status', status: 'running' });

  try {
    await executeRun({
      run,
      profile,
      targets,
      plan,
      signal: controller.signal,
      logger,
      onEvent: (event) => {
        emit(run.id, event).catch((error) => logger.error('failed to record event', error));
      },
      onItemChange: (targetId, updater) => patchItem(run.id, targetId, updater),
    });
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error(`run ${run.id} failed`, error);
    await patchRun(run.id, (current) => ({ ...current, error: message }));
    await emit(run.id, { type: 'run.failed', level: 'error', message });
  } finally {
    active.delete(run.id);

    const finished = await patchRun(run.id, (current) => {
      const succeeded = current.items.filter((i) => i.status === 'succeeded').length;
      const failed = current.items.filter((i) => i.status === 'failed').length;

      const status = controller.signal.aborted
        ? 'cancelled'
        : failed === 0 && succeeded > 0
          ? 'completed'
          : succeeded > 0
            ? 'partial'
            : 'failed';

      return { ...current, status, finishedAt: now() };
    });

    const summary = summariseRun(finished);
    await emit(run.id, {
      type: 'run.finished',
      level: finished.status === 'completed' ? 'success' : finished.status === 'cancelled' ? 'warning' : 'error',
      message:
        finished.status === 'cancelled'
          ? 'Run cancelled.'
          : `${summary.succeeded} of ${summary.targets} finished` +
            (summary.failed ? `, ${summary.failed} failed` : '') +
            `. ${summary.totalTokens.toLocaleString('en-US')} tokens used.`,
    });

    bus.emit(run.id, { kind: 'status', status: finished.status, summary });
    bus.emit(run.id, { kind: 'done' });

    // Record the run against each target so the targets table shows progress.
    for (const item of finished.items) {
      if (item.status !== 'succeeded') continue;
      httpJson(`${serviceUrl('targets')}/targets/${item.targetId}`, {
        method: 'PATCH',
        serviceName: 'targets',
        retries: 1,
        body: { lastRunId: finished.id, lastRunAt: finished.finishedAt, status: 'ready' },
      }).catch(() => undefined);
    }
  }
}

app.post(
  '/runs/:id/cancel',
  route(async (req, res) => {
    const controller = active.get(req.params.id);
    if (!controller) throw new AppError('That run is not currently going, so there is nothing to cancel.', 409);

    controller.abort();
    await emit(req.params.id, { type: 'run.cancelled', level: 'warning', message: 'Cancelling. Steps already in flight will finish first.' });
    res.json(ok({ id: req.params.id, cancelling: true }));
  }),
);

app.delete(
  '/runs/:id',
  route(async (req, res) => {
    if (active.has(req.params.id)) throw new AppError('Cancel the run before deleting it.', 409);

    const removed = await runs.delete(req.params.id);
    if (!removed) throw new NotFoundError('Run', req.params.id);
    res.json(ok({ id: req.params.id, deleted: true }));
  }),
);

/**
 * Saves an edited step output.
 *
 * Generated drafts are a starting point, not a verdict. Editing in place keeps
 * the applicant's final wording next to the run that produced it, which is
 * where they will look for it later.
 */
app.patch(
  '/runs/:id/items/:targetId/steps/:stepKey',
  route(async (req, res) => {
    const { output } = req.body ?? {};
    if (output === undefined) throw new AppError('Send the edited output under an "output" key.', 422);

    const updated = await patchRun(req.params.id, (run) => ({
      ...run,
      items: run.items.map((item) =>
        item.targetId === req.params.targetId
          ? {
              ...item,
              steps: item.steps.map((step) => (step.key === req.params.stepKey ? { ...step, output } : step)),
            }
          : item,
      ),
    }));

    const item = updated.items.find((i) => i.targetId === req.params.targetId);
    if (!item) throw new NotFoundError('Target in this run', req.params.targetId);

    res.json(ok(item.steps.find((s) => s.key === req.params.stepKey)));
  }),
);

/**
 * Live progress over server-sent events.
 *
 * A snapshot goes out first so a browser opened halfway through a run renders
 * the current state immediately instead of an empty console.
 */
app.get(
  '/runs/:id/stream',
  route(async (req, res) => {
    const record = await runs.findById(req.params.id);
    if (!record) throw new NotFoundError('Run', req.params.id);

    const run = hydrate(record);

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send({ kind: 'snapshot', run: { ...run, summary: summariseRun(run), live: active.has(run.id) } });

    if (!active.has(run.id) && run.status !== 'queued' && run.status !== 'running') {
      send({ kind: 'done' });
      res.end();
      return;
    }

    const listener = (payload) => {
      send(payload);
      if (payload.kind === 'done') {
        cleanup();
        res.end();
      }
    };

    // Proxies and load balancers drop idle connections; a comment line every
    // 20 seconds keeps the stream open through a long research step.
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      bus.off(run.id, listener);
    };

    bus.on(run.id, listener);
    req.on('close', cleanup);
  }),
);

/** Dashboard aggregate, so the overview screen makes one request. */
app.get(
  '/overview',
  route(async (_req, res) => {
    const allRuns = (await runs.readAll()).map(hydrate);
    const settings = await settingsStore.read();
    const apiKey = await describeKey();

    const totals = allRuns.reduce(
      (acc, run) => {
        const summary = summariseRun(run);
        return {
          runs: acc.runs + 1,
          drafts: acc.drafts + summary.succeeded,
          failed: acc.failed + summary.failed,
          tokens: acc.tokens + summary.totalTokens,
          estimatedCostUsd: acc.estimatedCostUsd + summary.estimatedCostUsd,
        };
      },
      { runs: 0, drafts: 0, failed: 0, tokens: 0, estimatedCostUsd: 0 },
    );

    res.json(
      ok({
        totals: { ...totals, estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(4)) },
        recentRuns: [...allRuns]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 6)
          .map((run) => ({
            id: run.id,
            label: run.label,
            status: run.status,
            createdAt: run.createdAt,
            profileName: run.profileName,
            pipelineName: run.pipelineName,
            summary: summariseRun(run),
          })),
        activeRuns: [...active.keys()],
        demoModeActive: settings.demoMode || !apiKey.present,
        apiKey,
      }),
    );
  }),
);

finaliseService(app, logger);
listen(app, process.env.ORCHESTRATOR_PORT ?? 4007, logger);
