/**
 * Browser-side workspace.
 *
 * On a shared deployment there is no server-side storage and no accounts: each
 * visitor's applicants, targets, prompts, pipelines, and runs live in their own
 * browser, and their API key never leaves it except on the model call they
 * trigger themselves.
 *
 * That is not a limitation worked around — it is the only arrangement in which
 * one deployment can serve strangers without the operator holding anyone's
 * research, CV, or key.
 */

const PREFIX = 'flow:v1:';

/** Collections mirror the JSON files the self-hosted services own. */
export type Collection = 'profiles' | 'targets' | 'prompts' | 'pipelines' | 'runs' | 'settings';

/**
 * Reads a collection. Returns the fallback on anything unreadable rather than
 * throwing: a corrupted entry in one browser should degrade to an empty
 * workspace, not a blank screen with a stack trace.
 */
export function read<T>(collection: Collection, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(`${PREFIX}${collection}`);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class StorageFullError extends Error {
  constructor() {
    super(
      'This browser is out of storage for the site. Delete a few old runs — they are the largest records — and try again.',
    );
    this.name = 'StorageFullError';
  }
}

export function write<T>(collection: Collection, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(`${PREFIX}${collection}`, JSON.stringify(value));
  } catch (error) {
    // Quota is the realistic failure, and silently dropping the write would
    // let someone keep editing a profile that is no longer being saved.
    const name = (error as { name?: string })?.name ?? '';
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new StorageFullError();
    }
    throw error;
  }
}

export function readList<T>(collection: Collection): T[] {
  const value = read<T[]>(collection, []);
  return Array.isArray(value) ? value : [];
}

export function writeList<T>(collection: Collection, rows: T[]): T[] {
  write(collection, rows);
  return rows;
}

/** Everything the visitor has stored, for export and for the reset action. */
export function exportWorkspace(): Record<string, unknown> {
  return {
    exportedAt: new Date().toISOString(),
    profiles: readList('profiles'),
    targets: readList('targets'),
    prompts: readList('prompts'),
    pipelines: readList('pipelines'),
    runs: readList('runs'),
    settings: read('settings', {}),
  };
}

export function clearWorkspace(): void {
  if (typeof window === 'undefined') return;
  for (const collection of ['profiles', 'targets', 'prompts', 'pipelines', 'runs', 'settings'] as Collection[]) {
    window.localStorage.removeItem(`${PREFIX}${collection}`);
  }
}

/** Rough bytes used, so the settings screen can warn before the quota bites. */
export function workspaceSize(): number {
  if (typeof window === 'undefined') return 0;

  let total = 0;
  for (const collection of ['profiles', 'targets', 'prompts', 'pipelines', 'runs', 'settings'] as Collection[]) {
    total += window.localStorage.getItem(`${PREFIX}${collection}`)?.length ?? 0;
  }
  return total;
}
