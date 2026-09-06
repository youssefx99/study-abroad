import { UpstreamError, AppError } from '@flow/shared';

/**
 * Service-to-service HTTP with retry and timeout.
 *
 * Retries only what is safe to retry — connection failures, 429, and 5xx — so
 * a validation error surfaces immediately instead of being tried three times.
 *
 * @param {string} url
 * @param {{
 *   method?: string,
 *   body?: unknown,
 *   headers?: Record<string, string>,
 *   timeoutMs?: number,
 *   retries?: number,
 *   serviceName?: string,
 *   signal?: AbortSignal
 * }} [options]
 * @returns {Promise<any>}
 */
export async function httpJson(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeoutMs = 180_000,
    retries = 2,
    serviceName = 'upstream',
    signal,
  } = options;

  let lastError = new UpstreamError(serviceName, 'request never ran');

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      /** @type {any} */
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { success: false, error: text.slice(0, 500) };
        }
      }

      if (response.ok) return payload;

      const message = payload?.error ?? `responded ${response.status}`;

      // A 4xx is the upstream service answering, not failing: the message was
      // written for the end user and the details carry per-field validation
      // issues. Pass both through untouched. Wrapping them would prefix the
      // service name onto a sentence meant for a person, and drop the field
      // errors the forms need. Rate limiting is the exception — it is
      // transient, so it falls through to the retry path below.
      if (response.status < 500 && response.status !== 429) {
        throw new AppError(message, response.status, payload?.details);
      }

      lastError = new UpstreamError(serviceName, message, response.status);
    } catch (error) {
      // Application errors are final; only transport failures are retried.
      if (error instanceof AppError && !(error instanceof UpstreamError)) throw error;
      if (error instanceof UpstreamError && error.status < 500 && error.status !== 429) throw error;

      if (signal?.aborted) {
        throw new UpstreamError(serviceName, 'request was cancelled', 499);
      }

      const reason = error instanceof Error ? error.message : 'request failed';
      lastError =
        reason === 'This operation was aborted' || reason.includes('abort')
          ? new UpstreamError(serviceName, `timed out after ${timeoutMs}ms`, 504)
          : new UpstreamError(serviceName, reason, 502);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    if (attempt < retries) {
      const delay = Math.min(500 * 2 ** attempt, 4000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Pipes a server-sent-event stream from an upstream service to a client
 * response. The gateway uses this to relay live run progress without buffering.
 *
 * @param {string} url
 * @param {import('express').Response} res
 * @param {{ signal?: AbortSignal, serviceName?: string }} [options]
 */
export async function httpStream(url, res, options = {}) {
  const { signal, serviceName = 'upstream' } = options;

  const upstream = await fetch(url, {
    headers: { accept: 'text/event-stream' },
    signal,
  }).catch((error) => {
    throw new UpstreamError(serviceName, error instanceof Error ? error.message : 'stream failed', 502);
  });

  if (!upstream.ok || !upstream.body) {
    throw new UpstreamError(serviceName, `stream responded ${upstream.status}`, 502);
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const reader = upstream.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    reader.cancel().catch(() => undefined);
    res.end();
  }
}
