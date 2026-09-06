import 'dotenv/config';
import { createService, finaliseService, listen, route } from '@flow/service-kit';
import { JsonRepository } from '@flow/store';
import {
  ok,
  createId,
  slugify,
  AppError,
  NotFoundError,
  promptSchema,
  promptInputSchema,
  promptVersionInputSchema,
  modelConfigSchema,
  getActiveVersion,
  extractVariables,
  renderTemplate,
  validateOutputSchema,
  pipelineSchema,
  pipelineInputSchema,
  pipelinePatchSchema,
  validatePipeline,
  serviceForStage,
} from '@flow/shared';
import { buildDefaultPrompts, buildDefaultPipelines } from './builtins.js';

/**
 * Prompt service. Owns the prompt library and the pipelines that sequence it.
 *
 * This is the service that makes the platform adaptable rather than opinionated.
 * Changing what the system asks a model to do is a write to this service, not a
 * code change, so an applicant in a field the authors never considered can make
 * the tool fit their situation without waiting for a release.
 */

const now = () => new Date().toISOString();

const prompts = new JsonRepository('prompts', { seed: buildDefaultPrompts(now(), createId) });
const pipelines = new JsonRepository('pipelines', { seed: buildDefaultPipelines(now(), createId) });

const { app, logger } = createService({ name: 'prompts' });

/** @param {unknown} record */
const hydratePrompt = (record) => promptSchema.parse(record);
/** @param {unknown} record */
const hydratePipeline = (record) => pipelineSchema.parse(record);

/**
 * Attaches everything the editor needs to render without extra round trips:
 * the resolved active version, the variables the template actually references,
 * and any problems with the output schema.
 * @param {ReturnType<typeof hydratePrompt>} prompt
 */
function decorate(prompt) {
  const active = getActiveVersion(prompt);

  return {
    ...prompt,
    active,
    detectedVariables: extractVariables(active.systemPrompt, active.userPrompt),
    schemaIssues: validateOutputSchema(active.outputSchema),
  };
}

// --------------------------------------------------------------------------
// Prompts
// --------------------------------------------------------------------------

app.get(
  '/prompts',
  route(async (req, res) => {
    const rows = (await prompts.readAll()).map(hydratePrompt);
    const stage = String(req.query.stage ?? '').trim();
    const search = String(req.query.search ?? '').trim().toLowerCase();

    const filtered = rows.filter((p) => {
      if (stage && p.stage !== stage) return false;
      if (!search) return true;
      return [p.name, p.key, p.description, ...p.tags].join(' ').toLowerCase().includes(search);
    });

    res.json(
      ok(
        filtered.map((p) => {
          const active = getActiveVersion(p);
          return {
            id: p.id,
            key: p.key,
            name: p.name,
            description: p.description,
            stage: p.stage,
            isBuiltIn: p.isBuiltIn,
            tags: p.tags,
            updatedAt: p.updatedAt,
            activeVersion: p.activeVersion,
            versionCount: p.versions.length,
            model: active.config.model,
            webSearch: active.config.webSearch,
            hasSchema: Boolean(active.outputSchema),
            variableCount: extractVariables(active.systemPrompt, active.userPrompt).length,
          };
        }),
        { total: filtered.length },
      ),
    );
  }),
);

/** Accepts either the record id or the stable key, so URLs can be readable. */
async function findPrompt(idOrKey) {
  const rows = (await prompts.readAll()).map(hydratePrompt);
  return rows.find((p) => p.id === idOrKey || p.key === idOrKey) ?? null;
}

app.get(
  '/prompts/:idOrKey',
  route(async (req, res) => {
    const prompt = await findPrompt(req.params.idOrKey);
    if (!prompt) throw new NotFoundError('Prompt', req.params.idOrKey);
    res.json(ok(decorate(prompt)));
  }),
);

app.post(
  '/prompts',
  route(async (req, res) => {
    const input = promptInputSchema.parse(req.body ?? {});
    const existing = (await prompts.readAll()).map(hydratePrompt);

    const stage = input.stage ?? 'custom';
    let key = input.key?.trim() || `${stage}.${slugify(input.name).replace(/-/g, '_')}`;
    if (existing.some((p) => p.key === key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;

    const createdAt = now();
    const record = promptSchema.parse({
      id: createId('prm'),
      createdAt,
      updatedAt: createdAt,
      key,
      name: input.name,
      description: input.description ?? '',
      stage,
      activeVersion: 1,
      isBuiltIn: false,
      tags: input.tags ?? [],
      versions: [
        {
          version: 1,
          createdAt,
          note: 'First version',
          systemPrompt: input.systemPrompt ?? '',
          userPrompt: input.userPrompt ?? '',
          config: modelConfigSchema.parse(input.config ?? {}),
          outputSchema: input.outputSchema ?? null,
          variables: [],
        },
      ],
    });

    await prompts.create(record);
    logger.info(`created prompt ${record.key}`);
    res.status(201).json(ok(decorate(record)));
  }),
);

/** Metadata edits. Prompt text changes go through the versions endpoint. */
app.patch(
  '/prompts/:idOrKey',
  route(async (req, res) => {
    const prompt = await findPrompt(req.params.idOrKey);
    if (!prompt) throw new NotFoundError('Prompt', req.params.idOrKey);

    const patch = promptInputSchema.partial().parse(req.body ?? {});

    const updated = await prompts.update(prompt.id, (current) =>
      promptSchema.parse({
        ...hydratePrompt(current),
        name: patch.name ?? current.name,
        description: patch.description ?? current.description,
        stage: patch.stage ?? current.stage,
        tags: patch.tags ?? current.tags,
        updatedAt: now(),
      }),
    );

    res.json(ok(decorate(updated)));
  }),
);

/**
 * Publishing a version never overwrites history. Editing a prompt that produced
 * a run and losing the text that produced it would make results unexplainable.
 */
app.post(
  '/prompts/:idOrKey/versions',
  route(async (req, res) => {
    const prompt = await findPrompt(req.params.idOrKey);
    if (!prompt) throw new NotFoundError('Prompt', req.params.idOrKey);

    const input = promptVersionInputSchema.parse(req.body ?? {});
    const active = getActiveVersion(prompt);

    const issues = validateOutputSchema(input.outputSchema === undefined ? active.outputSchema : input.outputSchema);
    if (issues.length) throw new AppError(`The output schema needs fixing: ${issues.join(' ')}`, 422, { issues });

    const nextNumber = Math.max(...prompt.versions.map((v) => v.version)) + 1;

    const version = {
      version: nextNumber,
      createdAt: now(),
      note: input.note ?? `Version ${nextNumber}`,
      systemPrompt: input.systemPrompt ?? active.systemPrompt,
      userPrompt: input.userPrompt ?? active.userPrompt,
      config: modelConfigSchema.parse({ ...active.config, ...(input.config ?? {}) }),
      outputSchema: input.outputSchema === undefined ? active.outputSchema : input.outputSchema,
      variables: active.variables,
    };

    const updated = await prompts.update(prompt.id, (current) =>
      promptSchema.parse({
        ...hydratePrompt(current),
        // Keep at most 20 versions so the store stays small on long projects.
        versions: [...hydratePrompt(current).versions, version].slice(-20),
        activeVersion: nextNumber,
        updatedAt: now(),
      }),
    );

    logger.info(`published ${prompt.key} v${nextNumber}`);
    res.status(201).json(ok(decorate(updated)));
  }),
);

app.post(
  '/prompts/:idOrKey/activate/:version',
  route(async (req, res) => {
    const prompt = await findPrompt(req.params.idOrKey);
    if (!prompt) throw new NotFoundError('Prompt', req.params.idOrKey);

    const version = Number(req.params.version);
    if (!prompt.versions.some((v) => v.version === version)) {
      throw new NotFoundError(`Version of ${prompt.key}`, req.params.version);
    }

    const updated = await prompts.update(prompt.id, (current) =>
      promptSchema.parse({ ...hydratePrompt(current), activeVersion: version, updatedAt: now() }),
    );

    logger.info(`rolled ${prompt.key} back to v${version}`);
    res.json(ok(decorate(updated)));
  }),
);

app.post(
  '/prompts/:idOrKey/duplicate',
  route(async (req, res) => {
    const source = await findPrompt(req.params.idOrKey);
    if (!source) throw new NotFoundError('Prompt', req.params.idOrKey);

    const active = getActiveVersion(source);
    const createdAt = now();
    const existing = (await prompts.readAll()).map(hydratePrompt);

    let key = `${source.key}_copy`;
    let suffix = 2;
    while (existing.some((p) => p.key === key)) {
      key = `${source.key}_copy${suffix}`;
      suffix += 1;
    }

    const copy = promptSchema.parse({
      id: createId('prm'),
      createdAt,
      updatedAt: createdAt,
      key,
      name: `${source.name} (copy)`,
      description: source.description,
      stage: source.stage,
      activeVersion: 1,
      isBuiltIn: false,
      tags: source.tags,
      versions: [{ ...active, version: 1, createdAt, note: `Copied from ${source.key} v${active.version}` }],
    });

    await prompts.create(copy);
    res.status(201).json(ok(decorate(copy)));
  }),
);

/** Restores a built-in to the text it shipped with. */
app.post(
  '/prompts/:idOrKey/restore',
  route(async (req, res) => {
    const prompt = await findPrompt(req.params.idOrKey);
    if (!prompt) throw new NotFoundError('Prompt', req.params.idOrKey);
    if (!prompt.isBuiltIn) throw new AppError('Only built-in prompts can be restored to their original text.', 422);

    const original = buildDefaultPrompts(now(), createId).find((p) => p.key === prompt.key);
    if (!original) throw new AppError(`"${prompt.key}" has no shipped original to restore.`, 422);

    const nextNumber = Math.max(...prompt.versions.map((v) => v.version)) + 1;
    const restored = { ...original.versions[0], version: nextNumber, createdAt: now(), note: 'Restored the original' };

    const updated = await prompts.update(prompt.id, (current) =>
      promptSchema.parse({
        ...hydratePrompt(current),
        versions: [...hydratePrompt(current).versions, restored].slice(-20),
        activeVersion: nextNumber,
        updatedAt: now(),
      }),
    );

    res.json(ok(decorate(updated)));
  }),
);

app.delete(
  '/prompts/:idOrKey',
  route(async (req, res) => {
    const prompt = await findPrompt(req.params.idOrKey);
    if (!prompt) throw new NotFoundError('Prompt', req.params.idOrKey);

    const allPipelines = (await pipelines.readAll()).map(hydratePipeline);
    const used = allPipelines.filter((p) => p.steps.some((s) => s.promptKey === prompt.key));
    if (used.length) {
      throw new AppError(
        `"${prompt.name}" is used by ${used.map((p) => `"${p.name}"`).join(', ')}. Remove it from those pipelines first.`,
        409,
      );
    }

    await prompts.delete(prompt.id);
    res.json(ok({ id: prompt.id, deleted: true }));
  }),
);

/**
 * Renders a prompt against sample context so the editor can show the exact text
 * that would be sent, and warn about variables that resolve to nothing.
 */
app.post(
  '/prompts/:idOrKey/render',
  route(async (req, res) => {
    const prompt = await findPrompt(req.params.idOrKey);
    if (!prompt) throw new NotFoundError('Prompt', req.params.idOrKey);

    const active = getActiveVersion(prompt);
    const overrides = req.body?.overrides ?? {};
    const context = req.body?.context ?? {};

    const systemSource = overrides.systemPrompt ?? active.systemPrompt;
    const userSource = overrides.userPrompt ?? active.userPrompt;

    const system = renderTemplate(systemSource, context);
    const user = renderTemplate(userSource, context);
    const missing = [...new Set([...system.missing, ...user.missing])];

    res.json(
      ok({
        systemPrompt: system.text,
        userPrompt: user.text,
        missingVariables: missing,
        detectedVariables: extractVariables(systemSource, userSource),
        characters: system.text.length + user.text.length,
        approximateTokens: Math.round((system.text.length + user.text.length) / 4),
      }),
    );
  }),
);

// --------------------------------------------------------------------------
// Pipelines
// --------------------------------------------------------------------------

app.get(
  '/pipelines',
  route(async (_req, res) => {
    const rows = (await pipelines.readAll()).map(hydratePipeline);
    const promptKeys = (await prompts.readAll()).map((p) => hydratePrompt(p).key);

    res.json(
      ok(
        rows.map((p) => ({
          ...p,
          stepCount: p.steps.filter((s) => s.enabled).length,
          issues: validatePipeline(p, promptKeys),
        })),
        { total: rows.length },
      ),
    );
  }),
);

app.get(
  '/pipelines/:id',
  route(async (req, res) => {
    const record = await pipelines.findById(req.params.id);
    if (!record) throw new NotFoundError('Pipeline', req.params.id);

    const pipeline = hydratePipeline(record);
    const allPrompts = (await prompts.readAll()).map(hydratePrompt);

    // Resolve each step's prompt so the builder can show model and stage inline.
    const steps = pipeline.steps.map((step) => {
      const prompt = allPrompts.find((p) => p.key === step.promptKey) ?? null;
      const active = prompt ? getActiveVersion(prompt) : null;

      return {
        ...step,
        prompt: prompt
          ? {
              id: prompt.id,
              key: prompt.key,
              name: prompt.name,
              stage: prompt.stage,
              model: active.config.model,
              webSearch: active.config.webSearch,
              version: prompt.activeVersion,
            }
          : null,
      };
    });

    res.json(
      ok({
        ...pipeline,
        steps,
        issues: validatePipeline(pipeline, allPrompts.map((p) => p.key)),
      }),
    );
  }),
);

app.post(
  '/pipelines',
  route(async (req, res) => {
    const input = pipelineInputSchema.parse(req.body ?? {});
    const createdAt = now();

    const record = pipelineSchema.parse({
      ...input,
      steps: (input.steps ?? []).map((step) => ({ ...step, id: step.id ?? createId('stp') })),
      id: createId('ppl'),
      createdAt,
      updatedAt: createdAt,
      isBuiltIn: false,
    });

    await pipelines.create(record);
    logger.info(`created pipeline ${record.name}`);
    res.status(201).json(ok(record));
  }),
);

app.patch(
  '/pipelines/:id',
  route(async (req, res) => {
    const patch = pipelinePatchSchema.parse(req.body ?? {});

    const updated = await pipelines.update(req.params.id, (current) =>
      pipelineSchema.parse({
        ...hydratePipeline(current),
        ...patch,
        steps: (patch.steps ?? hydratePipeline(current).steps).map((step) => ({
          ...step,
          id: step.id ?? createId('stp'),
          service: step.service ?? serviceForStage(step.stage ?? 'custom'),
        })),
        id: current.id,
        createdAt: current.createdAt,
        isBuiltIn: current.isBuiltIn,
        updatedAt: now(),
      }),
    );

    if (!updated) throw new NotFoundError('Pipeline', req.params.id);
    res.json(ok(updated));
  }),
);

app.post(
  '/pipelines/:id/duplicate',
  route(async (req, res) => {
    const source = await pipelines.findById(req.params.id);
    if (!source) throw new NotFoundError('Pipeline', req.params.id);

    const createdAt = now();
    const copy = pipelineSchema.parse({
      ...hydratePipeline(source),
      id: createId('ppl'),
      name: `${hydratePipeline(source).name} (copy)`,
      steps: hydratePipeline(source).steps.map((s) => ({ ...s, id: createId('stp') })),
      isBuiltIn: false,
      createdAt,
      updatedAt: createdAt,
    });

    await pipelines.create(copy);
    res.status(201).json(ok(copy));
  }),
);

app.delete(
  '/pipelines/:id',
  route(async (req, res) => {
    const record = await pipelines.findById(req.params.id);
    if (!record) throw new NotFoundError('Pipeline', req.params.id);

    await pipelines.delete(req.params.id);
    res.json(ok({ id: req.params.id, deleted: true }));
  }),
);

/**
 * Internal: the orchestrator resolves a pipeline plus every prompt it needs in
 * one call, so a run never makes N round trips before it starts.
 */
app.get(
  '/internal/plan/:pipelineId',
  route(async (req, res) => {
    const record = await pipelines.findById(req.params.pipelineId);
    if (!record) throw new NotFoundError('Pipeline', req.params.pipelineId);

    const pipeline = hydratePipeline(record);
    const allPrompts = (await prompts.readAll()).map(hydratePrompt);

    const steps = pipeline.steps
      .filter((step) => step.enabled)
      .map((step) => {
        const prompt = allPrompts.find((p) => p.key === step.promptKey);
        if (!prompt) {
          throw new AppError(
            `Pipeline "${pipeline.name}" references the prompt "${step.promptKey}", which no longer exists. Open the pipeline and pick a different prompt for the step "${step.title}".`,
            422,
          );
        }

        const active = getActiveVersion(prompt);
        return {
          key: step.key,
          title: step.title,
          service: step.service,
          optional: step.optional,
          promptKey: prompt.key,
          promptName: prompt.name,
          promptVersion: active.version,
          systemPrompt: active.systemPrompt,
          userPrompt: active.userPrompt,
          config: active.config,
          outputSchema: active.outputSchema,
        };
      });

    if (!steps.length) {
      throw new AppError(`Pipeline "${pipeline.name}" has no enabled steps.`, 422);
    }

    res.json(ok({ pipeline: { id: pipeline.id, name: pipeline.name, description: pipeline.description }, steps }));
  }),
);

finaliseService(app, logger);
listen(app, process.env.PROMPTS_PORT ?? 4003, logger);
