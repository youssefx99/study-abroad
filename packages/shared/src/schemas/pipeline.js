import { z } from 'zod';
import { STAGES } from '../constants.js';

/**
 * A pipeline is an ordered list of steps. Each step names a prompt and the
 * service that executes it, so adding "translate the draft into German" or
 * "check the message against the department's stated requirements" is a data
 * change the applicant makes in the UI.
 */

const trimmed = z.string().trim();

export const pipelineStepSchema = z.object({
  id: trimmed.min(1),
  /** Key the step writes its output under; later steps read `steps.<key>`. */
  key: trimmed.min(1).max(60).regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, digits, and underscores'),
  title: trimmed.min(1).max(200),
  description: trimmed.max(1000).default(''),
  promptKey: trimmed.min(1).max(120),
  /** research | analysis | outreach */
  service: trimmed.min(1).max(40).default('analysis'),
  enabled: z.boolean().default(true),
  /** Steps that fail without blocking the rest of the run. */
  optional: z.boolean().default(false),
});

export const pipelineSchema = z.object({
  id: trimmed.min(1),
  createdAt: trimmed,
  updatedAt: trimmed,

  name: trimmed.min(1, 'Give the pipeline a name').max(200),
  description: trimmed.max(2000).default(''),
  steps: z.array(pipelineStepSchema).min(1, 'A pipeline needs at least one step'),
  isBuiltIn: z.boolean().default(false),
  tags: z.array(trimmed.max(60)).default([]),
});

export const pipelineInputSchema = pipelineSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial()
  .extend({ name: trimmed.min(1, 'Give the pipeline a name').max(200) });

export const pipelinePatchSchema = pipelineSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

/**
 * Maps a stage to the service that runs it.
 * @param {string} stage
 * @returns {string}
 */
export function serviceForStage(stage) {
  return STAGES.find((s) => s.value === stage)?.service ?? 'analysis';
}

/**
 * Checks a pipeline for problems that would only surface mid-run: duplicate
 * output keys, missing prompts, or every step disabled.
 * @param {z.infer<typeof pipelineSchema>} pipeline
 * @param {string[]} availablePromptKeys
 * @returns {{ level: 'error' | 'warning', message: string }[]}
 */
export function validatePipeline(pipeline, availablePromptKeys) {
  const issues = [];
  const seen = new Set();

  for (const step of pipeline.steps) {
    if (seen.has(step.key)) {
      issues.push({ level: 'error', message: `Two steps both write to "${step.key}". Output keys must be unique.` });
    }
    seen.add(step.key);

    if (!availablePromptKeys.includes(step.promptKey)) {
      issues.push({ level: 'error', message: `Step "${step.title}" points at prompt "${step.promptKey}", which does not exist.` });
    }
  }

  if (!pipeline.steps.some((s) => s.enabled)) {
    issues.push({ level: 'error', message: 'Every step is switched off, so the run would do nothing.' });
  }

  return issues;
}
