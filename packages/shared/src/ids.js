import { randomUUID } from 'node:crypto';

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
