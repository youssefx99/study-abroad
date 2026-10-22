import 'server-only';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * The analytics database.
 *
 * Optional by design: the app deploys and works with no database at all, in
 * which case nothing is recorded and the admin screen explains how to connect
 * one. The Neon integration on the Vercel Marketplace sets `DATABASE_URL`.
 *
 * Created lazily, so `next build` never needs the variable to exist.
 */

type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;
let schemaReady: Promise<void> | null = null;

function connectionString(): string {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(connectionString());
}

/**
 * Two tables. `flow_events` is the log every metric is computed from;
 * `flow_visitors` keeps one row per browser, so "new users" and "all-time
 * users" do not need a scan of every event ever written.
 */
async function createSchema(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS flow_events (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      type TEXT NOT NULL,
      visitor_id TEXT,
      session_id TEXT,
      name TEXT,
      country TEXT,
      device TEXT,
      referrer TEXT,
      model TEXT,
      ok BOOLEAN,
      error_code TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      props JSONB
    )`;
  await sql`CREATE INDEX IF NOT EXISTS flow_events_at_idx ON flow_events (at)`;
  await sql`CREATE INDEX IF NOT EXISTS flow_events_type_at_idx ON flow_events (type, at)`;
  await sql`CREATE INDEX IF NOT EXISTS flow_events_visitor_idx ON flow_events (visitor_id, at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS flow_visitors (
      visitor_id TEXT PRIMARY KEY,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      country TEXT,
      device TEXT
    )`;

  // Failed sign-ins, keyed by a hash of the address, so the login can slow a
  // password-guessing script down without the raw IP ever being stored.
  await sql`
    CREATE TABLE IF NOT EXISTS flow_admin_logins (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_hash TEXT NOT NULL,
      ok BOOLEAN NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS flow_admin_logins_ip_idx ON flow_admin_logins (ip_hash, at)`;
}

/** @returns a ready client, or null when no database is configured. */
export async function getSql(): Promise<Sql | null> {
  const url = connectionString();
  if (!url) return null;

  client ??= neon(url);
  // Once per instance. A failure clears the promise so the next request retries
  // instead of every request failing on a cached rejection.
  schemaReady ??= createSchema(client).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;

  return client;
}
