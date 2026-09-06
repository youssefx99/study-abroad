import { z } from 'zod';
import { linkSchema, customFieldSchema } from './profile.js';

/**
 * A target is anyone or anything an applicant reaches out to: a professor, a
 * degree program, an admissions office, a scholarship body, a lab, or a
 * company. One shape covers all of them, because the process is identical —
 * research the target, judge the fit, write the message.
 */

const trimmed = z.string().trim();
const shortText = trimmed.max(300).optional().default('');

export const targetSchema = z.object({
  id: trimmed.min(1),
  createdAt: trimmed,
  updatedAt: trimmed,

  kind: trimmed.max(40).default('professor'),
  name: trimmed.min(1, 'Add a name for this target').max(300),
  /** University, company, or funding body. */
  organization: shortText,
  department: shortText,
  role: shortText,

  country: shortText,
  city: shortText,

  email: shortText,
  links: z.array(linkSchema).default([]),

  focusAreas: z.array(trimmed.max(200)).default([]),
  /** Free text so "rolling", "1 Dec 2026", or "check site" all work. */
  deadline: shortText,
  /** BCP-47 tag for the outreach language; falls back to the run default. */
  language: trimmed.max(20).default('en'),

  status: trimmed.max(40).default('new'),
  priority: z.number().int().min(1).max(5).default(3),

  notes: trimmed.max(20000).optional().default(''),
  tags: z.array(trimmed.max(60)).default([]),
  customFields: z.array(customFieldSchema).default([]),

  /** Set by the orchestrator after a successful run. */
  lastRunId: shortText,
  lastRunAt: shortText,
});

export const targetInputSchema = targetSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial()
  .extend({ name: trimmed.min(1, 'Add a name for this target').max(300) });

export const targetPatchSchema = targetSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

/** Bulk import accepts loose rows and normalises them. */
export const targetImportRowSchema = z
  .object({
    kind: z.string().optional(),
    name: z.string().optional(),
    /** Accepts the legacy `professors.json` shape too. */
    university: z.string().optional(),
    organization: z.string().optional(),
    department: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    google_scholar: z.string().optional(),
    scholar: z.string().optional(),
    links: z.array(z.union([z.string(), linkSchema.partial()])).optional(),
    others: z.array(z.string()).optional(),
    focusAreas: z.union([z.string(), z.array(z.string())]).optional(),
    deadline: z.string().optional(),
    language: z.string().optional(),
    priority: z.union([z.number(), z.string()]).optional(),
    tags: z.union([z.string(), z.array(z.string())]).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/**
 * Splits a value that may arrive as an array or a delimited string.
 * @param {unknown} value
 * @returns {string[]}
 */
function toList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[;,|]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Normalises one imported row into target input, tolerating the field names
 * people actually paste: spreadsheet headers, the old `professors.json`, or a
 * hand-written JSON array.
 * @param {unknown} row
 * @param {(prefix: string) => string} makeId
 * @returns {Record<string, unknown>}
 */
export function normaliseImportRow(row, makeId) {
  const parsed = targetImportRowSchema.parse(row);

  /** @type {{ id: string, label: string, url: string }[]} */
  const links = [];
  const addLink = (label, url) => {
    const cleaned = String(url ?? '').trim();
    if (!cleaned) return;
    if (links.some((l) => l.url === cleaned)) return;
    links.push({ id: makeId('lnk'), label, url: cleaned });
  };

  addLink('Website', parsed.website);
  addLink('Google Scholar', parsed.google_scholar ?? parsed.scholar);
  for (const other of parsed.others ?? []) addLink('Link', other);
  for (const link of parsed.links ?? []) {
    if (typeof link === 'string') addLink('Link', link);
    else addLink(link.label ?? 'Link', link.url ?? '');
  }

  const priority = Number(parsed.priority);

  return {
    kind: parsed.kind?.trim() || 'professor',
    name: parsed.name?.trim() || '',
    organization: (parsed.organization ?? parsed.university ?? '').trim(),
    department: parsed.department?.trim() ?? '',
    country: parsed.country?.trim() ?? '',
    city: parsed.city?.trim() ?? '',
    email: parsed.email?.trim() ?? '',
    links,
    focusAreas: toList(parsed.focusAreas),
    deadline: parsed.deadline?.trim() ?? '',
    language: parsed.language?.trim() || 'en',
    priority: Number.isFinite(priority) && priority >= 1 && priority <= 5 ? Math.round(priority) : 3,
    tags: toList(parsed.tags),
    notes: parsed.notes?.trim() ?? '',
  };
}

/**
 * Renders a target as the prompt block every stage shares.
 * @param {z.infer<typeof targetSchema>} target
 * @returns {string}
 */
export function targetToPromptBlock(target) {
  const lines = [];
  const push = (label, value) => {
    const text = String(value ?? '').trim();
    if (text) lines.push(`${label}: ${text}`);
  };

  push('Type', target.kind);
  push('Name', target.name);
  push('Organisation', target.organization);
  push('Department', target.department);
  push('Role', target.role);
  push('Location', [target.city, target.country].filter(Boolean).join(', '));
  push('Stated focus areas', target.focusAreas.join(', '));
  push('Deadline', target.deadline);

  const usableLinks = target.links.filter((l) => l.url.trim());
  if (usableLinks.length) {
    lines.push('Links:');
    for (const l of usableLinks) lines.push(`- ${l.label}: ${l.url}`);
  }

  push('Notes from the applicant', target.notes);

  const filledCustom = target.customFields.filter((f) => f.value.trim());
  if (filledCustom.length) {
    lines.push('Additional details:');
    for (const f of filledCustom) lines.push(`- ${f.label}: ${f.value}`);
  }

  return lines.join('\n').trim();
}
