/**
 * Web Crypto is available in browsers and in Node 19+, so the same code runs
 * on the server and in the browser. The web app imports these schemas and the
 * prompt library directly, which is what keeps one definition of both.
 *
 * @returns {string}
 */
function randomUUID() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  // Older runtimes: build a v4 from getRandomValues.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Prefixed, sortable-ish identifiers. The prefix makes IDs self-describing in
 * logs and URLs, which matters once eight services are passing them around.
 * @param {string} prefix
 * @returns {string}
 */
export function createId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/**
 * Turns arbitrary user text into a stable, URL-safe key.
 * Falls back to a random suffix so non-Latin input still yields a usable key —
 * applicants and institutions are worldwide, so names arrive in every script.
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
  const base = String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return base || `item-${randomUUID().slice(0, 8)}`;
}
