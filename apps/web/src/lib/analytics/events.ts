/**
 * The vocabulary of usage analytics, shared by the browser that sends events,
 * the route that accepts them, and the admin screen that reads them back.
 *
 * What is recorded is deliberately thin: which screen was opened, which kind of
 * action was taken, how a run ended, and how many tokens a model call used.
 * Never a name, a CV, a prompt, a draft, or a key. Visitors are identified only
 * by a random id their own browser generated, so "a user" means "a browser".
 */

/** Event types the browser may send. `model_call` is server-only, so token counts cannot be forged. */
export const CLIENT_EVENT_TYPES = ['page_view', 'action', 'run_started', 'run_finished'] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type EventType = ClientEventType | 'model_call';

/**
 * Every mutation worth counting, keyed by a stable name. Matching on the route
 * rather than instrumenting each screen means a new button that calls an
 * existing endpoint is counted without anyone remembering to add a line.
 */
export const ACTIONS: { key: string; method: string; pattern: RegExp; label: string }[] = [
  { key: 'profile.create', method: 'POST', pattern: /^\/api\/profiles$/, label: 'Created an applicant' },
  { key: 'profile.update', method: 'PATCH', pattern: /^\/api\/profiles\/[^/]+$/, label: 'Edited an applicant' },
  { key: 'profile.duplicate', method: 'POST', pattern: /^\/api\/profiles\/[^/]+\/duplicate$/, label: 'Duplicated an applicant' },
  { key: 'profile.delete', method: 'DELETE', pattern: /^\/api\/profiles\/[^/]+$/, label: 'Deleted an applicant' },
  { key: 'target.create', method: 'POST', pattern: /^\/api\/targets$/, label: 'Added a target' },
  { key: 'target.update', method: 'PATCH', pattern: /^\/api\/targets\/[^/]+$/, label: 'Edited a target' },
  { key: 'target.delete', method: 'DELETE', pattern: /^\/api\/targets\/[^/]+$/, label: 'Deleted a target' },
  { key: 'targets.import', method: 'POST', pattern: /^\/api\/targets\/import$/, label: 'Imported a target list' },
  { key: 'targets.bulk_update', method: 'POST', pattern: /^\/api\/targets\/bulk$/, label: 'Bulk-edited targets' },
  { key: 'targets.bulk_delete', method: 'POST', pattern: /^\/api\/targets\/bulk-delete$/, label: 'Bulk-deleted targets' },
  { key: 'prompt.create', method: 'POST', pattern: /^\/api\/prompts$/, label: 'Created a prompt' },
  { key: 'prompt.publish', method: 'POST', pattern: /^\/api\/prompts\/[^/]+\/versions$/, label: 'Published a prompt version' },
  { key: 'prompt.restore', method: 'POST', pattern: /^\/api\/prompts\/[^/]+\/restore$/, label: 'Restored a built-in prompt' },
  { key: 'prompt.duplicate', method: 'POST', pattern: /^\/api\/prompts\/[^/]+\/duplicate$/, label: 'Duplicated a prompt' },
  { key: 'prompt.delete', method: 'DELETE', pattern: /^\/api\/prompts\/[^/]+$/, label: 'Deleted a prompt' },
  { key: 'pipeline.create', method: 'POST', pattern: /^\/api\/pipelines$/, label: 'Created a pipeline' },
  { key: 'run.cancel', method: 'POST', pattern: /^\/api\/runs\/[^/]+\/cancel$/, label: 'Cancelled a run' },
  { key: 'draft.edit', method: 'PATCH', pattern: /^\/api\/runs\/[^/]+\/items\/[^/]+\/steps\/[^/]+$/, label: 'Edited a draft' },
  { key: 'settings.update', method: 'PATCH', pattern: /^\/api\/settings$/, label: 'Changed settings' },
  { key: 'api_key.save', method: 'PUT', pattern: /^\/api\/settings\/api-key$/, label: 'Added their own API key' },
  { key: 'api_key.test', method: 'POST', pattern: /^\/api\/settings\/api-key\/test$/, label: 'Tested their API key' },
];

const ACTION_KEYS = new Set(ACTIONS.map((a) => a.key));

export function isActionKey(key: string): boolean {
  return ACTION_KEYS.has(key);
}

export function matchAction(method: string, path: string): string | null {
  const route = path.split('?')[0];
  return ACTIONS.find((a) => a.method === method && a.pattern.test(route))?.key ?? null;
}

export function actionLabel(key: string): string {
  return ACTIONS.find((a) => a.key === key)?.label ?? key;
}

/** Record ids never reach analytics: dynamic segments collapse to a placeholder. */
const PAGE_PATTERNS: [RegExp, string][] = [
  [/^\/applicants\/[^/]+$/, '/applicants/:id'],
  [/^\/prompts\/[^/]+$/, '/prompts/:key'],
  [/^\/runs\/(?!new$)[^/]+$/, '/runs/:id'],
];

export function normalisePath(pathname: string): string {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return PAGE_PATTERNS.find(([pattern]) => pattern.test(path))?.[1] ?? path;
}

export const PAGE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/dashboard': 'Dashboard',
  '/applicants': 'Applicants list',
  '/applicants/:id': 'Applicant editor',
  '/targets': 'Targets',
  '/prompts': 'Prompts list',
  '/prompts/:key': 'Prompt editor',
  '/pipelines': 'Pipelines',
  '/runs': 'Runs list',
  '/runs/new': 'Run wizard',
  '/runs/:id': 'Run console',
  '/settings': 'Settings',
};

/** Pipeline step keys from the built-in library, plus the two one-off calls. */
export const STEP_LABELS: Record<string, string> = {
  research: 'Research',
  analysis: 'Fit analysis',
  draft: 'Drafting',
  final: 'Review',
  cv_import: 'CV import',
  key_check: 'API key check',
};

export const RUN_STATUSES = ['completed', 'partial', 'failed', 'cancelled'] as const;

/** What a failed model call means for the person who hit it. */
export const ERROR_LABELS: Record<string, string> = {
  invalid_key: 'Invalid API key',
  out_of_credit: 'OpenAI account out of credit',
  rate_limited: 'Rate-limited by OpenAI',
  model_forbidden: 'Key cannot use that model',
  model_missing: 'Model does not exist',
  bad_output: 'Model returned unusable output',
  upstream: 'OpenAI outage',
  other: 'Other error',
};
