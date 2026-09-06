import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the API key without ever putting it on the wire.
 *
 * The orchestrator is the only writer of `data/secrets.json`; the stage
 * services read it. Passing the key between services in request bodies would
 * put it in every debug log and proxy trace, so they each read it locally
 * instead.
 */

// Anchored to the repository root for the same reason the store is: each
// service runs from its own folder.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DATA_DIR = process.env.FLOW_DATA_DIR
  ? path.resolve(process.env.FLOW_DATA_DIR)
  : path.join(PACKAGE_ROOT, 'data');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');

/** @type {{ value: string | null, readAt: number }} */
let cache = { value: null, readAt: 0 };
const CACHE_MS = 5_000;

/**
 * Environment wins over the stored key, so a deployment can pin a key that the
 * UI cannot overwrite.
 * @returns {Promise<string | null>}
 */
export async function resolveApiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  if (Date.now() - cache.readAt < CACHE_MS) return cache.value;

  let value = null;
  if (existsSync(SECRETS_FILE)) {
    try {
      const parsed = JSON.parse(await readFile(SECRETS_FILE, 'utf-8'));
      const stored = typeof parsed?.openaiApiKey === 'string' ? parsed.openaiApiKey.trim() : '';
      value = stored || null;
    } catch {
      value = null;
    }
  }

  cache = { value, readAt: Date.now() };
  return value;
}

/** Forces the next read to hit disk. Called after the key is changed. */
export function invalidateApiKeyCache() {
  cache = { value: null, readAt: 0 };
}

export { SECRETS_FILE };
