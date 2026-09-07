import type { ApiResponse } from './types';
import { handleLocalRequest, LocalApiError } from './cloud/local-api';
import { subscribeToLocalRun, isRunActive, startLocalRun, cancelLocalRun } from './cloud/run-engine';
import { getApiKey } from './cloud/api-key';

/**
 * The single client for the gateway.
 *
 * Every call unwraps the shared envelope and throws a typed error, so screens
 * only ever handle data or a message they can show — never a raw status code.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly issues: { field: string; message: string }[];

  constructor(message: string, status: number, issues: { field: string; message: string }[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

/** Same-origin in the browser; Next rewrites `/api/*` to the gateway. */
const BASE = '';

/**
 * Two deployment shapes, one call site.
 *
 * Self-hosted, the app talks to the eight services through the gateway.
 * Deployed to a serverless host there is no gateway and no shared filesystem,
 * so the same REST surface is served from the visitor's own browser storage.
 *
 * The switch lives here and nowhere else: every screen makes the same calls in
 * both modes, which is what keeps them from drifting apart.
 */
export const CLOUD_MODE = process.env.NEXT_PUBLIC_FLOW_MODE === 'cloud';

/** Paths the browser workspace serves itself. Model calls always go out. */
const NETWORK_PATHS = ['/api/execute', '/api/run-step'];

function servedLocally(path: string): boolean {
  return CLOUD_MODE && !NETWORK_PATHS.some((p) => path.startsWith(p));
}

function runLocally<T>(method: string, path: string, body: unknown): T {
  try {
    return handleLocalRequest(method, path, (body ?? {}) as Record<string, unknown>).data as T;
  } catch (error) {
    if (error instanceof LocalApiError) throw new ApiError(error.message, error.status, error.issues);
    throw new ApiError(error instanceof Error ? error.message : 'Something went wrong in the browser workspace.', 500);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (servedLocally(path)) {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    // Two paths need more than a synchronous read of browser storage.
    if (method === 'POST' && path === '/api/runs') {
      try {
        return startLocalRun(body) as T;
      } catch (error) {
        if (error instanceof LocalApiError) throw new ApiError(error.message, error.status, error.issues);
        throw new ApiError(error instanceof Error ? error.message : 'Could not start the run.', 500);
      }
    }

    const cancelMatch = path.match(/^\/api\/runs\/([^/]+)\/cancel$/);
    if (method === 'POST' && cancelMatch) {
      if (!cancelLocalRun(cancelMatch[1])) {
        throw new ApiError('That run is not currently going, so there is nothing to cancel.', 409);
      }
      return { id: cancelMatch[1], cancelling: true } as T;
    }

    if (method === 'POST' && path === '/api/settings/api-key/test') {
      return (await testApiKey()) as T;
    }

    return runLocally<T>(method, path, body);
  }

  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    // A failed fetch is almost always the backend not running, and saying so
    // saves people from opening devtools to find out.
    throw new ApiError('Cannot reach the API. Check that the services are running with "npm run dev".', 0);
  }

  const text = await response.text();
  let payload: ApiResponse<T> | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new ApiError(`The server returned something unreadable (HTTP ${response.status}).`, response.status);
    }
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.details?.issues ?? [],
    );
  }

  return payload?.data as T;
}

/** Some list endpoints carry facets and totals alongside the rows. */
async function requestWithMeta<T>(path: string): Promise<{ data: T; meta: Record<string, unknown> }> {
  if (servedLocally(path)) {
    try {
      const result = handleLocalRequest('GET', path);
      return { data: result.data as T, meta: (result.meta ?? {}) as Record<string, unknown> };
    } catch (error) {
      if (error instanceof LocalApiError) throw new ApiError(error.message, error.status, error.issues);
      throw new ApiError('Something went wrong in the browser workspace.', 500);
    }
  }

  const response = await fetch(`${BASE}${path}`).catch(() => null);
  if (!response) throw new ApiError('Cannot reach the API. Check that the services are running.', 0);

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || payload?.success === false) {
    throw new ApiError(payload?.error ?? `Request failed with status ${response.status}`, response.status, payload?.details?.issues ?? []);
  }

  return { data: payload?.data as T, meta: payload?.meta ?? {} };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getWithMeta: requestWithMeta,
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * Verifies the visitor's key with the cheapest possible live call, so they find
 * out it is wrong here rather than forty targets into a run.
 */
async function testApiKey(): Promise<{ ok: boolean; message: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, message: 'No API key is set. Add your own OpenAI key above to run for real.' };
  }

  try {
    const response = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        step: {
          key: 'key_check',
          title: 'Key check',
          userPrompt: 'Reply with the single word: ready',
          outputSchema: null,
          config: { model: 'gpt-5-mini', temperature: null, reasoningEffort: null, maxOutputTokens: 16, webSearch: false },
        },
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      return { ok: false, message: payload?.error ?? `The check failed with status ${response.status}.` };
    }

    return { ok: true, message: `The key works. It answered in ${payload.data.usage.totalTokens} tokens.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The check could not be completed.' };
  }
}

/** SWR fetcher. */
export const fetcher = <T>(path: string) => request<T>(path);

/**
 * Subscribes to a run's live progress.
 *
 * `EventSource` handles reconnection, but it also retries after the stream ends
 * normally, which would reopen a finished run forever. The `done` message
 * closes it explicitly.
 */
export function subscribeToRun(
  runId: string,
  onMessage: (message: unknown) => void,
  onError?: () => void,
): () => void {
  // In cloud mode the run is executing in this tab, so progress comes straight
  // from the engine. There is no stream to open and nothing to reconnect to.
  if (CLOUD_MODE) {
    if (!isRunActive(runId)) {
      onMessage({ kind: 'done' });
      return () => undefined;
    }

    const unsubscribe = subscribeToLocalRun(runId, (run) => {
      onMessage({ kind: 'snapshot', run });
      if (run.status !== 'running' && run.status !== 'queued') onMessage({ kind: 'done' });
    });

    return unsubscribe;
  }

  const source = new EventSource(`${BASE}/api/runs/${runId}/stream`);

  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onMessage(parsed);
      if (parsed?.kind === 'done') source.close();
    } catch {
      /* A malformed frame is not worth tearing the stream down for. */
    }
  };

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) onError?.();
  };

  return () => source.close();
}
