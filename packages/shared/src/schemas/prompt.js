import { z } from 'zod';
import { DEFAULT_MODEL } from '../constants.js';

/**
 * Prompt templates are first-class, user-owned data.
 *
 * Nothing about what the model is asked lives in service code — a prompt is a
 * versioned record the applicant can read, edit, test, publish, and roll back.
 * That is what makes the platform field-agnostic: changing "write to a physics
 * professor" into "write to a scholarship committee" is an edit, not a deploy.
 */

const trimmed = z.string().trim();

export const promptVariableSchema = z.object({
  name: trimmed.min(1).max(80),
  description: trimmed.max(400).default(''),
  example: trimmed.max(2000).default(''),
  required: z.boolean().default(false),
});

export const modelConfigSchema = z.object({
  model: trimmed.min(1).max(120).default(DEFAULT_MODEL),
  /**
   * Kept nullable because reasoning models reject an explicit temperature.
   * `null` means "do not send the parameter at all".
   */
  temperature: z.number().min(0).max(2).nullable().default(null),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).nullable().default(null),
  maxOutputTokens: z.number().int().min(64).max(128000).nullable().default(null),
  webSearch: z.boolean().default(false),
});

export const promptVersionSchema = z.object({
  version: z.number().int().min(1),
  createdAt: trimmed,
  note: trimmed.max(400).default(''),
  systemPrompt: trimmed.max(60000).default(''),
  userPrompt: trimmed.max(60000).default(''),
  config: modelConfigSchema,
  /** JSON Schema enforced on the model output, or null for free text. */
  outputSchema: z.record(z.any()).nullable().default(null),
  variables: z.array(promptVariableSchema).default([]),
});

export const promptSchema = z.object({
  id: trimmed.min(1),
  createdAt: trimmed,
  updatedAt: trimmed,

  /** Stable reference used by pipeline steps, e.g. "research.deep_profile". */
  key: trimmed.min(1).max(120),
  name: trimmed.min(1).max(200),
  description: trimmed.max(2000).default(''),
  stage: trimmed.max(40).default('custom'),

  activeVersion: z.number().int().min(1).default(1),
  versions: z.array(promptVersionSchema).min(1),

  /** Built-ins can be edited, but the UI offers "restore original". */
  isBuiltIn: z.boolean().default(false),
  tags: z.array(trimmed.max(60)).default([]),
});

export const promptInputSchema = z.object({
  key: trimmed.min(1).max(120).optional(),
  name: trimmed.min(1, 'Give the prompt a name').max(200),
  description: trimmed.max(2000).optional(),
  stage: trimmed.max(40).optional(),
  systemPrompt: trimmed.max(60000).optional(),
  userPrompt: trimmed.max(60000).optional(),
  config: modelConfigSchema.partial().optional(),
  outputSchema: z.record(z.any()).nullable().optional(),
  tags: z.array(trimmed.max(60)).optional(),
});

/** A new version is published rather than overwriting history. */
export const promptVersionInputSchema = z.object({
  note: trimmed.max(400).optional(),
  systemPrompt: trimmed.max(60000).optional(),
  userPrompt: trimmed.max(60000).optional(),
  config: modelConfigSchema.partial().optional(),
  outputSchema: z.record(z.any()).nullable().optional(),
});

/**
 * The model settings a prompt actually runs with.
 *
 * Model, temperature, reasoning effort, and token cap are no longer editable,
 * so they are decided here rather than read from a stored record. Workspaces
 * seeded before those settings were fixed still hold the old values, and
 * without this they would keep being sent — which is how a prompt ends up
 * asking a model for a temperature it rejects, with no field left to clear.
 *
 * `webSearch` is the one setting still carried per prompt: research needs it
 * and drafting must not have it.
 *
 * @param {{ webSearch?: boolean } | null | undefined} config
 */
export function resolveModelConfig(config) {
  return {
    model: DEFAULT_MODEL,
    temperature: null,
    reasoningEffort: null,
    maxOutputTokens: null,
    webSearch: Boolean(config?.webSearch),
  };
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}/g;

/**
 * Lists every `{{path}}` referenced in a template, de-duplicated and ordered by
 * first appearance so the editor can show them in reading order.
 * @param {...string} sources
 * @returns {string[]}
 */
export function extractVariables(...sources) {
  const found = [];
  for (const source of sources) {
    if (!source) continue;
    for (const match of String(source).matchAll(VARIABLE_PATTERN)) {
      const name = match[1];
      if (!found.includes(name)) found.push(name);
    }
  }
  return found;
}

/**
 * Reads a dotted path out of a context object.
 * @param {Record<string, unknown>} context
 * @param {string} path
 * @returns {unknown}
 */
export function readPath(context, path) {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = /** @type {unknown} */ (context);

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = /** @type {Record<string, unknown>} */ (current)[segment];
  }

  return current;
}

/**
 * Renders a template against a context.
 *
 * Missing variables are reported rather than silently blanked — a prompt that
 * quietly loses the applicant's research statement produces a plausible but
 * useless email, which is far worse than a visible error.
 *
 * @param {string} template
 * @param {Record<string, unknown>} context
 * @returns {{ text: string, missing: string[] }}
 */
export function renderTemplate(template, context) {
  const missing = [];

  const text = String(template ?? '').replace(VARIABLE_PATTERN, (_match, path) => {
    const value = readPath(context, path);

    if (value === undefined || value === null || value === '') {
      if (!missing.includes(path)) missing.push(path);
      return '';
    }

    if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });

  return { text, missing };
}

/**
 * Returns the version a prompt is currently serving, falling back to the last
 * entry if `activeVersion` points at something that was removed.
 * @param {z.infer<typeof promptSchema>} prompt
 * @returns {z.infer<typeof promptVersionSchema>}
 */
export function getActiveVersion(prompt) {
  const version =
    prompt.versions.find((v) => v.version === prompt.activeVersion) ??
    prompt.versions[prompt.versions.length - 1];

  // Resolved on the way out, so every caller — the plan builder, the editor,
  // the prompt list — sees the settings that will actually be used.
  return { ...version, config: resolveModelConfig(version.config) };
}

/**
 * Validates that a JSON Schema is shaped the way the Responses API expects for
 * strict structured output. Returns human-readable problems, not exceptions,
 * because this runs while the user is typing in the editor.
 * @param {unknown} schema
 * @returns {string[]}
 */
export function validateOutputSchema(schema) {
  if (schema === null || schema === undefined) return [];

  const problems = [];
  if (typeof schema !== 'object' || Array.isArray(schema)) {
    return ['The output schema must be a JSON object.'];
  }

  const root = /** @type {Record<string, unknown>} */ (schema);
  if (root.type !== 'object') problems.push('The root "type" must be "object".');
  if (typeof root.properties !== 'object' || root.properties === null) {
    problems.push('Add a "properties" object describing each field.');
  }
  if (root.additionalProperties !== false) {
    problems.push('Set "additionalProperties": false — strict mode requires it.');
  }

  if (root.properties && typeof root.properties === 'object') {
    const keys = Object.keys(/** @type {Record<string, unknown>} */ (root.properties));
    const required = Array.isArray(root.required) ? root.required.map(String) : [];
    const notRequired = keys.filter((k) => !required.includes(k));
    if (notRequired.length) {
      problems.push(`Strict mode needs every property in "required". Missing: ${notRequired.join(', ')}.`);
    }
  }

  return problems;
}
