import {
  createId,
  slugify,
  profileSchema,
  profileInputSchema,
  profilePatchSchema,
  profileToPromptBlock,
  scoreProfileCompleteness,
  targetSchema,
  targetInputSchema,
  targetPatchSchema,
  targetToPromptBlock,
  normaliseImportRow,
  promptSchema,
  modelConfigSchema,
  getActiveVersion,
  extractVariables,
  renderTemplate,
  validateOutputSchema,
  pipelineSchema,
  pipelineInputSchema,
  validatePipeline,
  runSchema,
  summariseRun,
  settingsSchema,
  buildDefaultPrompts,
  buildDefaultPipelines,
  DEGREE_LEVELS,
  TARGET_KINDS,
  TARGET_STATUSES,
  FUNDING_NEEDS,
  OUTREACH_LANGUAGES,
  OUTREACH_TONES,
  GRADE_SCALE_SUGGESTIONS,
  TEST_SUGGESTIONS,
  LANGUAGE_LEVELS,
  STAGES,
  MODEL_SUGGESTIONS,
  REASONING_EFFORTS,
} from '@flow/shared';
import { readList, writeList, read, write, exportWorkspace, workspaceSize } from './store';
import { getApiKeyState, setApiKey, clearApiKey, getApiKey, looksLikeKey } from './api-key';

/**
 * The gateway's REST surface, implemented against browser storage.
 *
 * The web app talks to the same paths whether it is running against the
 * self-hosted services or as a static deployment. Keeping the contract
 * identical means every screen, form, and error path is exercised by both, and
 * neither can quietly drift from the other.
 *
 * The schemas and the prompt library are imported from `@flow/shared` — the
 * same modules the services use — so validation and defaults cannot diverge.
 */

export class LocalApiError extends Error {
  readonly status: number;
  readonly issues: { field: string; message: string }[];

  constructor(message: string, status = 400, issues: { field: string; message: string }[] = []) {
    super(message);
    this.name = 'LocalApiError';
    this.status = status;
    this.issues = issues;
  }
}

const now = () => new Date().toISOString();

/** Seeds the prompt library and pipelines on first visit. */
function ensureSeeded(): void {
  if (readList('prompts').length === 0) {
    writeList('prompts', buildDefaultPrompts(now(), createId));
  }
  if (readList('pipelines').length === 0) {
    writeList('pipelines', buildDefaultPipelines(now(), createId));
  }
}

/** Turns a Zod failure into the same envelope the services produce. */
function parseOrThrow<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues ?? [];
    throw new LocalApiError(
      'Some fields need attention before this can be saved.',
      422,
      issues.map((issue) => ({ field: issue.path.join('.') || '(root)', message: issue.message })),
    );
  }
}

type Json = Record<string, unknown>;

/* ------------------------------------------------------------------ facets */

function countBy<T>(rows: T[], pick: (row: T) => string) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = pick(row);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}

/* ---------------------------------------------------------------- handlers */

function handleProfiles(method: string, rest: string[], body: Json, query: URLSearchParams) {
  const rows = readList<Json>('profiles').map((r) => profileSchema.parse(r));
  const [id, action] = rest;

  if (!id) {
    if (method === 'GET') {
      const search = (query.get('search') ?? '').trim().toLowerCase();
      const filtered = search
        ? rows.filter((p) =>
            [p.fullName, p.headline, p.email, ...p.tags, ...p.researchInterests].join(' ').toLowerCase().includes(search),
          )
        : rows;

      const sorted = [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return {
        data: sorted.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          headline: p.headline,
          email: p.email,
          nationality: p.nationality,
          countryOfResidence: p.countryOfResidence,
          targetDegree: p.targetDegree,
          targetIntake: p.targetIntake,
          researchInterests: p.researchInterests,
          tags: p.tags,
          updatedAt: p.updatedAt,
          completeness: scoreProfileCompleteness(p),
        })),
        meta: { total: sorted.length },
      };
    }

    if (method === 'POST') {
      const input = parseOrThrow(profileInputSchema, body);
      const stamp = now();
      const record = profileSchema.parse({ ...input, id: createId('app'), createdAt: stamp, updatedAt: stamp });
      writeList('profiles', [...rows, record]);
      return { data: decorateProfile(record) };
    }
  }

  const existing = rows.find((p) => p.id === id);

  if (action === 'duplicate' && method === 'POST') {
    if (!existing) throw new LocalApiError(`Applicant "${id}" was not found`, 404);
    const stamp = now();
    const copy = profileSchema.parse({
      ...existing,
      id: createId('app'),
      fullName: `${existing.fullName} (copy)`,
      createdAt: stamp,
      updatedAt: stamp,
    });
    writeList('profiles', [...rows, copy]);
    return { data: decorateProfile(copy) };
  }

  if (action === 'prompt-block' && method === 'GET') {
    if (!existing) throw new LocalApiError(`Applicant "${id}" was not found`, 404);
    const block = profileToPromptBlock(existing);
    return { data: { block, characters: block.length, approximateTokens: Math.round(block.length / 4) } };
  }

  if (!existing) throw new LocalApiError(`Applicant "${id}" was not found`, 404);

  if (method === 'GET') return { data: decorateProfile(existing) };

  if (method === 'PATCH') {
    const patch = parseOrThrow(profilePatchSchema, body);
    const updated = profileSchema.parse({ ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: now() });
    writeList('profiles', rows.map((p) => (p.id === id ? updated : p)));
    return { data: decorateProfile(updated) };
  }

  if (method === 'DELETE') {
    writeList('profiles', rows.filter((p) => p.id !== id));
    return { data: { id, deleted: true } };
  }

  throw new LocalApiError(`No route matches ${method} /api/profiles`, 404);
}

function decorateProfile(profile: ReturnType<typeof profileSchema.parse>) {
  return { ...profile, completeness: scoreProfileCompleteness(profile), promptBlock: profileToPromptBlock(profile) };
}

function handleTargets(method: string, rest: string[], body: Json, query: URLSearchParams) {
  const rows = readList<Json>('targets').map((r) => targetSchema.parse(r));
  const [first, second] = rest;

  if (!first && method === 'GET') {
    const search = (query.get('search') ?? '').trim().toLowerCase();
    const kind = (query.get('kind') ?? '').trim();
    const status = (query.get('status') ?? '').trim();
    const country = (query.get('country') ?? '').trim();

    const filtered = rows.filter((t) => {
      if (kind && t.kind !== kind) return false;
      if (status && t.status !== status) return false;
      if (country && t.country.toLowerCase() !== country.toLowerCase()) return false;
      if (!search) return true;
      return [t.name, t.organization, t.department, t.country, t.city, t.notes, ...t.focusAreas, ...t.tags]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });

    const sorted = [...filtered].sort((a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt));

    return {
      data: sorted,
      meta: {
        total: sorted.length,
        facets: {
          kinds: countBy(rows, (t) => t.kind),
          statuses: countBy(rows, (t) => t.status),
          countries: countBy(rows.filter((t) => t.country), (t) => t.country),
          tags: countBy(rows.flatMap((t) => t.tags.map((tag) => ({ tag }))), (t) => t.tag),
        },
      },
    };
  }

  if (!first && method === 'POST') {
    const input = parseOrThrow(targetInputSchema, body);
    const stamp = now();
    const record = targetSchema.parse({ ...input, id: createId('tgt'), createdAt: stamp, updatedAt: stamp });
    writeList('targets', [...rows, record]);
    return { data: record };
  }

  if (first === 'bulk' && method === 'POST') {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    if (!ids.length) throw new LocalApiError('Select at least one target first.', 422);
    const patch = parseOrThrow(targetPatchSchema, body.patch ?? {});
    const next = rows.map((t) =>
      ids.includes(t.id) ? targetSchema.parse({ ...t, ...patch, id: t.id, createdAt: t.createdAt, updatedAt: now() }) : t,
    );
    writeList('targets', next);
    return { data: { updated: ids.length, targets: next.filter((t) => ids.includes(t.id)) } };
  }

  if (first === 'bulk-delete' && method === 'POST') {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    if (!ids.length) throw new LocalApiError('Select at least one target first.', 422);
    const next = rows.filter((t) => !ids.includes(t.id));
    writeList('targets', next);
    return { data: { deleted: rows.length - next.length } };
  }

  if (first === 'import') {
    const parsed = readImportContent(body);

    if (second === 'preview') {
      const preview = parsed.slice(0, 25).map((row, index) => {
        try {
          const normalised = normaliseImportRow(row, createId) as Json;
          return {
            row: index + 1,
            ok: Boolean(normalised.name),
            data: normalised,
            reason: normalised.name ? '' : 'No name in this row',
          };
        } catch (error) {
          return { row: index + 1, ok: false, data: null, reason: error instanceof Error ? error.message : 'Unreadable row' };
        }
      });
      return { data: { total: parsed.length, preview } };
    }

    const stamp = now();
    const seen = new Set(rows.map((t) => `${t.name.toLowerCase()}|${t.organization.toLowerCase()}`));
    const created: ReturnType<typeof targetSchema.parse>[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (const [index, row] of parsed.entries()) {
      try {
        const normalised = normaliseImportRow(row, createId) as Json;
        if (!normalised.name) {
          skipped.push({ row: index + 1, reason: 'No name in this row' });
          continue;
        }
        const fingerprint = `${String(normalised.name).toLowerCase()}|${String(normalised.organization ?? '').toLowerCase()}`;
        if (seen.has(fingerprint)) {
          skipped.push({ row: index + 1, reason: `"${normalised.name}" is already in your list` });
          continue;
        }
        seen.add(fingerprint);
        created.push(targetSchema.parse({ ...normalised, id: createId('tgt'), createdAt: stamp, updatedAt: stamp }));
      } catch (error) {
        skipped.push({ row: index + 1, reason: error instanceof Error ? error.message : 'Could not read this row' });
      }
    }

    if (created.length) writeList('targets', [...rows, ...created]);
    return { data: { imported: created.length, skipped, targets: created } };
  }

  const existing = rows.find((t) => t.id === first);
  if (!existing) throw new LocalApiError(`Target "${first}" was not found`, 404);

  if (method === 'GET') return { data: { ...existing, promptBlock: targetToPromptBlock(existing) } };

  if (method === 'PATCH') {
    const patch = parseOrThrow(targetPatchSchema, body);
    const updated = targetSchema.parse({ ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: now() });
    writeList('targets', rows.map((t) => (t.id === first ? updated : t)));
    return { data: updated };
  }

  if (method === 'DELETE') {
    writeList('targets', rows.filter((t) => t.id !== first));
    return { data: { id: first, deleted: true } };
  }

  throw new LocalApiError(`No route matches ${method} /api/targets`, 404);
}

/** Mirrors the targets service: JSON array, or CSV/TSV with a header row. */
function readImportContent(body: Json): unknown[] {
  const format = String(body.format ?? 'json');
  const content = String(body.content ?? '').trim();
  if (!content) throw new LocalApiError('Nothing to import. The content had no readable rows.', 422);

  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new LocalApiError(`That is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`, 422);
    }
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return [parsed];
    throw new LocalApiError('Expected a JSON array of targets.', 422);
  }

  const text = content.replace(/\r\n?/g, '\n');
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field.trim());
  rows.push(row);

  const usable = rows.filter((r) => r.some((cell) => cell !== ''));
  const [header, ...rest] = usable;
  if (!header) return [];

  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rest.map((cells) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      if (key) record[key] = cells[index] ?? '';
    });
    return record;
  });
}

function decoratePrompt(prompt: ReturnType<typeof promptSchema.parse>) {
  const active = getActiveVersion(prompt);
  return {
    ...prompt,
    active,
    detectedVariables: extractVariables(active.systemPrompt, active.userPrompt),
    schemaIssues: validateOutputSchema(active.outputSchema),
  };
}

function handlePrompts(method: string, rest: string[], body: Json, query: URLSearchParams) {
  ensureSeeded();
  const rows = readList<Json>('prompts').map((r) => promptSchema.parse(r));
  const [idOrKey, action, extra] = rest;

  if (!idOrKey) {
    if (method === 'GET') {
      const stage = (query.get('stage') ?? '').trim();
      const search = (query.get('search') ?? '').trim().toLowerCase();
      const filtered = rows.filter((p) => {
        if (stage && p.stage !== stage) return false;
        if (!search) return true;
        return [p.name, p.key, p.description, ...p.tags].join(' ').toLowerCase().includes(search);
      });

      return {
        data: filtered.map((p) => {
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
        meta: { total: filtered.length },
      };
    }

    if (method === 'POST') {
      const stage = String(body.stage ?? 'custom');
      const name = String(body.name ?? '').trim();
      if (!name) throw new LocalApiError('Give the prompt a name', 422, [{ field: 'name', message: 'Required' }]);

      let key = String(body.key ?? '').trim() || `${stage}.${slugify(name).replace(/-/g, '_')}`;
      if (rows.some((p) => p.key === key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;

      const stamp = now();
      const record = promptSchema.parse({
        id: createId('prm'),
        createdAt: stamp,
        updatedAt: stamp,
        key,
        name,
        description: String(body.description ?? ''),
        stage,
        activeVersion: 1,
        isBuiltIn: false,
        tags: body.tags ?? [],
        versions: [
          {
            version: 1,
            createdAt: stamp,
            note: 'First version',
            systemPrompt: String(body.systemPrompt ?? ''),
            userPrompt: String(body.userPrompt ?? ''),
            config: modelConfigSchema.parse(body.config ?? {}),
            outputSchema: (body.outputSchema as Json) ?? null,
            variables: [],
          },
        ],
      });

      writeList('prompts', [...rows, record]);
      return { data: decoratePrompt(record) };
    }
  }

  const existing = rows.find((p) => p.id === idOrKey || p.key === idOrKey);
  if (!existing) throw new LocalApiError(`Prompt "${idOrKey}" was not found`, 404);

  const replace = (updated: ReturnType<typeof promptSchema.parse>) => {
    writeList('prompts', rows.map((p) => (p.id === existing.id ? updated : p)));
    return { data: decoratePrompt(updated) };
  };

  if (action === 'versions' && method === 'POST') {
    const active = getActiveVersion(existing);
    const outputSchema = body.outputSchema === undefined ? active.outputSchema : (body.outputSchema as Json | null);
    const issues = validateOutputSchema(outputSchema);
    if (issues.length) throw new LocalApiError(`The output schema needs fixing: ${issues.join(' ')}`, 422);

    const nextNumber = Math.max(...existing.versions.map((v) => v.version)) + 1;
    const version = {
      version: nextNumber,
      createdAt: now(),
      note: String(body.note ?? `Version ${nextNumber}`),
      systemPrompt: body.systemPrompt === undefined ? active.systemPrompt : String(body.systemPrompt),
      userPrompt: body.userPrompt === undefined ? active.userPrompt : String(body.userPrompt),
      config: modelConfigSchema.parse({ ...active.config, ...((body.config as Json) ?? {}) }),
      outputSchema,
      variables: active.variables,
    };

    return replace(
      promptSchema.parse({ ...existing, versions: [...existing.versions, version].slice(-20), activeVersion: nextNumber, updatedAt: now() }),
    );
  }

  if (action === 'activate' && method === 'POST') {
    const version = Number(extra);
    if (!existing.versions.some((v) => v.version === version)) {
      throw new LocalApiError(`Version ${extra} of ${existing.key} was not found`, 404);
    }
    return replace(promptSchema.parse({ ...existing, activeVersion: version, updatedAt: now() }));
  }

  if (action === 'restore' && method === 'POST') {
    if (!existing.isBuiltIn) throw new LocalApiError('Only built-in prompts can be restored to their original text.', 422);
    const original = buildDefaultPrompts(now(), createId).find((p: { key: string }) => p.key === existing.key);
    if (!original) throw new LocalApiError(`"${existing.key}" has no shipped original to restore.`, 422);

    const nextNumber = Math.max(...existing.versions.map((v) => v.version)) + 1;
    const restored = { ...original.versions[0], version: nextNumber, createdAt: now(), note: 'Restored the original' };
    return replace(
      promptSchema.parse({ ...existing, versions: [...existing.versions, restored].slice(-20), activeVersion: nextNumber, updatedAt: now() }),
    );
  }

  if (action === 'duplicate' && method === 'POST') {
    const active = getActiveVersion(existing);
    const stamp = now();
    let key = `${existing.key}_copy`;
    let suffix = 2;
    while (rows.some((p) => p.key === key)) {
      key = `${existing.key}_copy${suffix}`;
      suffix += 1;
    }
    const copy = promptSchema.parse({
      id: createId('prm'),
      createdAt: stamp,
      updatedAt: stamp,
      key,
      name: `${existing.name} (copy)`,
      description: existing.description,
      stage: existing.stage,
      activeVersion: 1,
      isBuiltIn: false,
      tags: existing.tags,
      versions: [{ ...active, version: 1, createdAt: stamp, note: `Copied from ${existing.key} v${active.version}` }],
    });
    writeList('prompts', [...rows, copy]);
    return { data: decoratePrompt(copy) };
  }

  if (action === 'render' && method === 'POST') {
    const active = getActiveVersion(existing);
    const overrides = (body.overrides as Json) ?? {};
    const context = (body.context as Json) ?? {};

    const systemSource = String(overrides.systemPrompt ?? active.systemPrompt);
    const userSource = String(overrides.userPrompt ?? active.userPrompt);
    const system = renderTemplate(systemSource, context);
    const user = renderTemplate(userSource, context);
    const missing = [...new Set([...system.missing, ...user.missing])];

    return {
      data: {
        systemPrompt: system.text,
        userPrompt: user.text,
        missingVariables: missing,
        detectedVariables: extractVariables(systemSource, userSource),
        characters: system.text.length + user.text.length,
        approximateTokens: Math.round((system.text.length + user.text.length) / 4),
      },
    };
  }

  if (method === 'GET') return { data: decoratePrompt(existing) };

  if (method === 'PATCH') {
    return replace(
      promptSchema.parse({
        ...existing,
        name: body.name === undefined ? existing.name : String(body.name),
        description: body.description === undefined ? existing.description : String(body.description),
        stage: body.stage === undefined ? existing.stage : String(body.stage),
        tags: body.tags === undefined ? existing.tags : body.tags,
        updatedAt: now(),
      }),
    );
  }

  if (method === 'DELETE') {
    const pipelines = readList<Json>('pipelines').map((p) => pipelineSchema.parse(p));
    const used = pipelines.filter((p) => p.steps.some((s) => s.promptKey === existing.key));
    if (used.length) {
      throw new LocalApiError(
        `"${existing.name}" is used by ${used.map((p) => `"${p.name}"`).join(', ')}. Remove it from those pipelines first.`,
        409,
      );
    }
    writeList('prompts', rows.filter((p) => p.id !== existing.id));
    return { data: { id: existing.id, deleted: true } };
  }

  throw new LocalApiError(`No route matches ${method} /api/prompts`, 404);
}

function handlePipelines(method: string, rest: string[], body: Json) {
  ensureSeeded();
  const rows = readList<Json>('pipelines').map((r) => pipelineSchema.parse(r));
  const prompts = readList<Json>('prompts').map((r) => promptSchema.parse(r));
  const promptKeys = prompts.map((p) => p.key);
  const [id, action] = rest;

  if (!id) {
    if (method === 'GET') {
      return {
        data: rows.map((p) => ({
          ...p,
          steps: p.steps.map((step) => withPrompt(step, prompts)),
          stepCount: p.steps.filter((s) => s.enabled).length,
          issues: validatePipeline(p, promptKeys),
        })),
        meta: { total: rows.length },
      };
    }

    if (method === 'POST') {
      const input = parseOrThrow(pipelineInputSchema, body);
      const stamp = now();
      const record = pipelineSchema.parse({
        ...input,
        steps: (input.steps ?? []).map((step) => ({ ...step, id: step.id ?? createId('stp') })),
        id: createId('ppl'),
        createdAt: stamp,
        updatedAt: stamp,
        isBuiltIn: false,
      });
      writeList('pipelines', [...rows, record]);
      return { data: record };
    }
  }

  const existing = rows.find((p) => p.id === id);
  if (!existing) throw new LocalApiError(`Pipeline "${id}" was not found`, 404);

  if (action === 'duplicate' && method === 'POST') {
    const stamp = now();
    const copy = pipelineSchema.parse({
      ...existing,
      id: createId('ppl'),
      name: `${existing.name} (copy)`,
      steps: existing.steps.map((s) => ({ ...s, id: createId('stp') })),
      isBuiltIn: false,
      createdAt: stamp,
      updatedAt: stamp,
    });
    writeList('pipelines', [...rows, copy]);
    return { data: copy };
  }

  if (method === 'GET') {
    return {
      data: {
        ...existing,
        steps: existing.steps.map((step) => withPrompt(step, prompts)),
        issues: validatePipeline(existing, promptKeys),
      },
    };
  }

  if (method === 'PATCH') {
    const updated = pipelineSchema.parse({
      ...existing,
      name: body.name === undefined ? existing.name : String(body.name),
      description: body.description === undefined ? existing.description : String(body.description),
      steps: body.steps === undefined ? existing.steps : body.steps,
      tags: body.tags === undefined ? existing.tags : body.tags,
      id: existing.id,
      createdAt: existing.createdAt,
      isBuiltIn: existing.isBuiltIn,
      updatedAt: now(),
    });
    writeList('pipelines', rows.map((p) => (p.id === id ? updated : p)));
    return { data: { ...updated, steps: updated.steps.map((step) => withPrompt(step, prompts)) } };
  }

  if (method === 'DELETE') {
    writeList('pipelines', rows.filter((p) => p.id !== id));
    return { data: { id, deleted: true } };
  }

  throw new LocalApiError(`No route matches ${method} /api/pipelines`, 404);
}

function withPrompt(step: Record<string, unknown>, prompts: ReturnType<typeof promptSchema.parse>[]) {
  const prompt = prompts.find((p) => p.key === step.promptKey);
  if (!prompt) return { ...step, prompt: null };
  const active = getActiveVersion(prompt);
  return {
    ...step,
    prompt: {
      id: prompt.id,
      key: prompt.key,
      name: prompt.name,
      stage: prompt.stage,
      model: active.config.model,
      webSearch: active.config.webSearch,
      version: prompt.activeVersion,
    },
  };
}

/**
 * Resolves a pipeline into the plan the run engine executes. Mirrors the
 * prompts service's `/internal/plan/:id`.
 */
export function buildPlan(pipelineId: string) {
  ensureSeeded();
  const pipelines = readList<Json>('pipelines').map((r) => pipelineSchema.parse(r));
  const prompts = readList<Json>('prompts').map((r) => promptSchema.parse(r));

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) throw new LocalApiError(`Pipeline "${pipelineId}" was not found`, 404);

  const steps = pipeline.steps
    .filter((step) => step.enabled)
    .map((step) => {
      const prompt = prompts.find((p) => p.key === step.promptKey);
      if (!prompt) {
        throw new LocalApiError(
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

  if (!steps.length) throw new LocalApiError(`Pipeline "${pipeline.name}" has no enabled steps.`, 422);

  return { pipeline: { id: pipeline.id, name: pipeline.name, description: pipeline.description }, steps };
}

function handleRuns(method: string, rest: string[], body: Json, query: URLSearchParams) {
  const rows = readList<Json>('runs').map((r) => runSchema.parse(r));
  const [id, ...tail] = rest;

  if (!id && method === 'GET') {
    const profileId = (query.get('profileId') ?? '').trim();
    const limit = Math.min(Number(query.get('limit') ?? 50) || 50, 200);
    const filtered = profileId ? rows.filter((r) => r.profileId === profileId) : rows;
    const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);

    return {
      data: sorted.map((run) => ({
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
      meta: { total: filtered.length },
    };
  }

  const existing = rows.find((r) => r.id === id);
  if (!existing) throw new LocalApiError(`Run "${id}" was not found`, 404);

  if (method === 'GET' && !tail.length) {
    return { data: { ...existing, summary: summariseRun(existing), live: false } };
  }

  // PATCH /runs/:id/items/:targetId/steps/:stepKey — an edited draft.
  if (method === 'PATCH' && tail[0] === 'items' && tail[2] === 'steps') {
    const [, targetId, , stepKey] = tail;
    if (body.output === undefined) throw new LocalApiError('Send the edited output under an "output" key.', 422);

    const updated = runSchema.parse({
      ...existing,
      items: existing.items.map((item) =>
        item.targetId === targetId
          ? { ...item, steps: item.steps.map((step) => (step.key === stepKey ? { ...step, output: body.output } : step)) }
          : item,
      ),
    });

    writeList('runs', rows.map((r) => (r.id === id ? updated : r)));
    const item = updated.items.find((i) => i.targetId === targetId);
    return { data: item?.steps.find((s) => s.key === stepKey) };
  }

  if (method === 'DELETE') {
    writeList('runs', rows.filter((r) => r.id !== id));
    return { data: { id, deleted: true } };
  }

  throw new LocalApiError(`No route matches ${method} /api/runs`, 404);
}

function handleSettings(method: string, rest: string[], body: Json) {
  const stored = settingsSchema.parse(read('settings', {}));
  const [section, action] = rest;

  if (section === 'api-key') {
    if (action === 'test' && method === 'POST') {
      const key = getApiKey();
      if (!key) {
        return { data: { ok: false, message: 'No API key is set. Add your own OpenAI key above to run for real.' } };
      }
      // The actual check is a live call, made by the caller so this stays sync.
      return { data: { ok: true, message: 'pending', model: stored.analysisModel } };
    }

    if (method === 'PUT') {
      const key = String(body.apiKey ?? '').trim();
      if (!looksLikeKey(key)) throw new LocalApiError('That does not look like a complete API key.', 422);
      return { data: setApiKey(key, Boolean(body.remember)) };
    }

    if (method === 'DELETE') {
      clearApiKey();
      return { data: getApiKeyState() };
    }
  }

  const keyState = getApiKeyState();

  if (method === 'GET') {
    return {
      data: {
        ...stored,
        apiKey: { present: keyState.present, source: keyState.present ? 'settings' : 'none', hint: keyState.hint, editable: true },
        remembered: keyState.remembered,
        demoModeActive: stored.demoMode || !keyState.present,
        dataDir: 'this browser',
        storageBytes: workspaceSize(),
      },
    };
  }

  if (method === 'PATCH') {
    const updated = settingsSchema.parse({ ...stored, ...body, updatedAt: now() });
    write('settings', updated);
    return {
      data: {
        ...updated,
        apiKey: { present: keyState.present, source: keyState.present ? 'settings' : 'none', hint: keyState.hint, editable: true },
        remembered: keyState.remembered,
        demoModeActive: updated.demoMode || !keyState.present,
        dataDir: 'this browser',
        storageBytes: workspaceSize(),
      },
    };
  }

  throw new LocalApiError(`No route matches ${method} /api/settings`, 404);
}

function handleOverview() {
  const runs = readList<Json>('runs').map((r) => runSchema.parse(r));
  const stored = settingsSchema.parse(read('settings', {}));
  const keyState = getApiKeyState();

  const totals = runs.reduce(
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

  return {
    data: {
      totals: { ...totals, estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(4)) },
      recentRuns: [...runs]
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
      activeRuns: [],
      demoModeActive: stored.demoMode || !keyState.present,
      apiKey: { present: keyState.present, source: keyState.present ? 'settings' : 'none', hint: keyState.hint, editable: true },
    },
  };
}

const META = {
  degreeLevels: DEGREE_LEVELS,
  targetKinds: TARGET_KINDS,
  targetStatuses: TARGET_STATUSES,
  fundingNeeds: FUNDING_NEEDS,
  languages: OUTREACH_LANGUAGES,
  tones: OUTREACH_TONES,
  gradeScales: GRADE_SCALE_SUGGESTIONS,
  tests: TEST_SUGGESTIONS,
  languageLevels: LANGUAGE_LEVELS,
  stages: STAGES,
  models: MODEL_SUGGESTIONS,
  reasoningEfforts: REASONING_EFFORTS,
};

/**
 * Entry point. Routes a gateway-shaped request to the browser workspace.
 * @throws {LocalApiError}
 */
export function handleLocalRequest(method: string, path: string, body: Json = {}): { data: unknown; meta?: Json } {
  const [pathname, search = ''] = path.split('?');
  const query = new URLSearchParams(search);
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [resource, ...rest] = segments;

  switch (resource) {
    case 'meta':
      return { data: META };
    case 'health':
      return {
        data: {
          status: 'ok',
          gateway: { service: 'browser', label: 'Browser workspace', status: 'ok', latencyMs: 0 },
          services: [
            { service: 'storage', label: 'Browser storage', status: 'ok', latencyMs: 0, url: 'localStorage' },
            { service: 'execute', label: 'Model route', status: 'ok', latencyMs: 0, url: '/api/execute' },
          ],
          checkedAt: new Date().toISOString(),
        },
      };
    case 'profiles':
      return handleProfiles(method, rest, body, query);
    case 'targets':
      return handleTargets(method, rest, body, query);
    case 'prompts':
      return handlePrompts(method, rest, body, query);
    case 'pipelines':
      return handlePipelines(method, rest, body);
    case 'runs':
      return handleRuns(method, rest, body, query);
    case 'settings':
      return handleSettings(method, rest, body);
    case 'overview':
      return handleOverview();
    default:
      throw new LocalApiError(`No route matches ${method} ${pathname}`, 404);
  }
}

export { ensureSeeded, exportWorkspace };
