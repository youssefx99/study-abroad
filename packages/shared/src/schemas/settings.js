import { z } from 'zod';

const trimmed = z.string().trim();

export const settingsSchema = z.object({
  updatedAt: trimmed.default(''),

  researchModel: trimmed.max(120).default('gpt-5-mini'),
  analysisModel: trimmed.max(120).default('gpt-5-mini'),
  outreachModel: trimmed.max(120).default('gpt-5.1'),

  defaultLanguage: trimmed.max(20).default('en'),
  defaultTone: trimmed.max(40).default('professional'),
  defaultWordCount: z.number().int().min(80).max(1200).default(260),
  defaultConcurrency: z.number().int().min(1).max(8).default(2),

  /** Force demo mode even when a key is configured. */
  demoMode: z.boolean().default(false),
  /** Models the picker offers, on top of the built-in suggestions. */
  customModels: z.array(trimmed.max(120)).default([]),
});

export const settingsPatchSchema = settingsSchema.omit({ updatedAt: true }).partial();

export const apiKeyInputSchema = z.object({
  apiKey: trimmed.min(20, 'That does not look like a complete API key').max(400),
});

/**
 * Renders a key as a hint that proves which key is stored without exposing it.
 * The full value is never returned by any endpoint.
 * @param {string} key
 * @returns {string}
 */
export function maskApiKey(key) {
  const value = String(key ?? '');
  if (value.length < 12) return '••••';
  return `${value.slice(0, 5)}••••${value.slice(-4)}`;
}
