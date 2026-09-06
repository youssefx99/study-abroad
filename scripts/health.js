#!/usr/bin/env node
import 'dotenv/config';
import { SERVICE_REGISTRY, serviceUrl } from '@flow/shared';

/**
 * Checks every service and exits non-zero if any is down, so this can be used
 * as a readiness gate in CI or a container healthcheck.
 */
const names = Object.keys(SERVICE_REGISTRY);
const results = await Promise.all(
  names.map(async (name) => {
    const url = serviceUrl(name);
    const started = Date.now();
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      return { name, url, ok: response.ok, ms: Date.now() - started };
    } catch (error) {
      return { name, url, ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : 'failed' };
    }
  }),
);

console.log('');
for (const result of results) {
  const mark = result.ok ? 'ok  ' : 'DOWN';
  console.log(`  ${mark}  ${result.name.padEnd(14)} ${result.url.padEnd(26)} ${result.ms}ms${result.error ? `  ${result.error}` : ''}`);
}

const down = results.filter((r) => !r.ok);
console.log(`\n  ${results.length - down.length}/${results.length} services responding\n`);
process.exit(down.length ? 1 : 0);
