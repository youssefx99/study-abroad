import { z } from 'zod';
import { MODEL_PRICING } from '../constants.js';

const trimmed = z.string().trim();

export const usageSchema = z.object({
  promptTokens: z.number().int().min(0).default(0),
  completionTokens: z.number().int().min(0).default(0),
  reasoningTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).default(0),
  model: trimmed.default(''),
});

export const runStepSchema = z.object({
  key: trimmed,
  title: trimmed,
  service: trimmed,
  promptKey: trimmed,
  promptVersion: z.number().int().min(1).nullable().default(null),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']).default('pending'),
  startedAt: trimmed.nullable().default(null),
  finishedAt: trimmed.nullable().default(null),
  durationMs: z.number().int().min(0).nullable().default(null),
  usage: usageSchema.nullable().default(null),
  /** Structured output, shape defined by the prompt's own output schema. */
  output: z.any().nullable().default(null),
  /** Variables the template asked for but the context did not supply. */
  missingVariables: z.array(trimmed).default([]),
  error: trimmed.nullable().default(null),
});

export const runItemSchema = z.object({
  targetId: trimmed,
  targetName: trimmed,
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']).default('pending'),
  startedAt: trimmed.nullable().default(null),
  finishedAt: trimmed.nullable().default(null),
  durationMs: z.number().int().min(0).nullable().default(null),
  steps: z.array(runStepSchema).default([]),
  error: trimmed.nullable().default(null),
});

export const runEventSchema = z.object({
  at: trimmed,
  level: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  /** run.started | target.started | step.finished | run.finished, etc. */
  type: trimmed,
  message: trimmed,
  targetId: trimmed.nullable().default(null),
  stepKey: trimmed.nullable().default(null),
});

export const runOptionsSchema = z.object({
  concurrency: z.number().int().min(1).max(8).default(2),
  language: trimmed.max(20).default('en'),
  tone: trimmed.max(40).default('professional'),
  wordCount: z.number().int().min(80).max(1200).default(260),
  /** Extra instructions the applicant types for this run only. */
  extraInstructions: trimmed.max(4000).default(''),
  /** Demo mode: generate representative output without calling the API. */
  demoMode: z.boolean().default(false),
  /** Stop the whole run after this many consecutive target failures. */
  stopAfterFailures: z.number().int().min(1).max(50).default(5),
});

export const runSchema = z.object({
  id: trimmed.min(1),
  createdAt: trimmed,
  startedAt: trimmed.nullable().default(null),
  finishedAt: trimmed.nullable().default(null),

  label: trimmed.max(200).default(''),
  profileId: trimmed,
  profileName: trimmed.default(''),
  pipelineId: trimmed,
  pipelineName: trimmed.default(''),
  targetIds: z.array(trimmed).default([]),

  status: z.enum(['queued', 'running', 'completed', 'partial', 'failed', 'cancelled']).default('queued'),
  options: runOptionsSchema,
  items: z.array(runItemSchema).default([]),
  events: z.array(runEventSchema).default([]),
  error: trimmed.nullable().default(null),
});

export const runInputSchema = z.object({
  profileId: trimmed.min(1, 'Choose an applicant'),
  pipelineId: trimmed.min(1, 'Choose a pipeline'),
  targetIds: z.array(trimmed.min(1)).min(1, 'Choose at least one target'),
  label: trimmed.max(200).optional(),
  options: runOptionsSchema.partial().optional(),
});

/**
 * Adds two usage records. Used to roll step usage up to target and run level.
 * @param {z.infer<typeof usageSchema> | null} a
 * @param {z.infer<typeof usageSchema> | null} b
 */
export function addUsage(a, b) {
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    reasoningTokens: (a?.reasoningTokens ?? 0) + (b?.reasoningTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
    model: b?.model || a?.model || '',
  };
}

/**
 * Estimates spend from token counts. Labelled an estimate everywhere it is
 * shown, because published prices move and reasoning tokens bill as output.
 * @param {{ promptTokens: number, completionTokens: number, reasoningTokens?: number, model?: string }} usage
 * @returns {number}
 */
export function estimateCostUsd(usage) {
  const price = MODEL_PRICING[usage.model ?? ''] ?? MODEL_PRICING.default;
  const input = (usage.promptTokens / 1_000_000) * price.input;
  const output = ((usage.completionTokens + (usage.reasoningTokens ?? 0)) / 1_000_000) * price.output;
  return Number((input + output).toFixed(4));
}

/**
 * Derives every number the run screens display, so the API and the UI can
 * never disagree about how many targets finished.
 * @param {z.infer<typeof runSchema>} run
 */
export function summariseRun(run) {
  let promptTokens = 0;
  let completionTokens = 0;
  let reasoningTokens = 0;
  let estimatedCostUsd = 0;

  for (const item of run.items) {
    for (const step of item.steps) {
      if (!step.usage) continue;
      promptTokens += step.usage.promptTokens;
      completionTokens += step.usage.completionTokens;
      reasoningTokens += step.usage.reasoningTokens;
      estimatedCostUsd += estimateCostUsd(step.usage);
    }
  }

  const succeeded = run.items.filter((i) => i.status === 'succeeded').length;
  const failed = run.items.filter((i) => i.status === 'failed').length;
  const running = run.items.filter((i) => i.status === 'running').length;
  const pending = run.items.filter((i) => i.status === 'pending').length;

  const startedAt = run.startedAt ? Date.parse(run.startedAt) : null;
  const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : null;

  return {
    targets: run.items.length,
    succeeded,
    failed,
    running,
    pending,
    percent: run.items.length ? Math.round(((succeeded + failed) / run.items.length) * 100) : 0,
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens: promptTokens + completionTokens + reasoningTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
    durationMs: startedAt ? (finishedAt ?? Date.now()) - startedAt : null,
  };
}
