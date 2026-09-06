/**
 * Every service answers with the same envelope so the gateway and the web app
 * never need per-service response handling.
 * @template T
 * @param {T} data
 * @param {Record<string, unknown>} [meta]
 */
export function ok(data, meta) {
  return meta ? { success: true, data, meta } : { success: true, data };
}

/**
 * @param {string} error
 * @param {Record<string, unknown>} [details]
 */
export function fail(error, details) {
  return details ? { success: false, error, details } : { success: false, error };
}

/**
 * @template T
 * @param {T[]} items
 * @param {{ total: number, page: number, limit: number }} page
 */
export function paginated(items, page) {
  return { success: true, data: items, meta: { ...page, pages: Math.max(1, Math.ceil(page.total / page.limit)) } };
}
