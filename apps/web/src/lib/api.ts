import type { ApiResponse } from './types';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
