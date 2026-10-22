import 'server-only';
import { userAgent } from 'next/server';
import { getSql } from './db';
import type { EventType } from './events';

/**
 * Server side of usage analytics: turns an event into a row.
 *
 * Called from `after()`, so a slow or unreachable database adds nothing to the
 * response time of the request being measured, and a failure is logged rather
 * than shown to anyone.
 */

export interface EventRow {
  type: EventType;
  visitorId?: string | null;
  sessionId?: string | null;
  name?: string | null;
  country?: string | null;
  device?: string | null;
  referrer?: string | null;
  model?: string | null;
  ok?: boolean | null;
  errorCode?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  durationMs?: number | null;
  props?: Record<string, unknown> | null;
}

const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Ids arrive from the browser, so anything that is not shaped like one is dropped. */
export function cleanId(value: unknown): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}

/**
 * Coarse context from the request itself: the country Vercel geolocates (no IP
 * is kept), the device class, and whether it is a bot — bots are not users.
 */
export function requestContext(request: Request): { country: string | null; device: string; isBot: boolean } {
  const ua = userAgent(request);
  const country = request.headers.get('x-vercel-ip-country');

  return {
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    device: ua.device.type === 'mobile' || ua.device.type === 'tablet' ? ua.device.type : 'desktop',
    isBot: ua.isBot,
  };
}

const int = (value: number | undefined) => Math.max(0, Math.round(Number(value) || 0));

export async function recordEvent(row: EventRow): Promise<void> {
  try {
    const sql = await getSql();
    if (!sql) return;

    const visitorId = row.visitorId ?? null;

    // One statement: the visitor upsert rides along with the event insert, so
    // a page view costs one round trip rather than two.
    await sql`
      WITH seen AS (
        INSERT INTO flow_visitors (visitor_id, country, device)
        SELECT ${visitorId}::text, ${row.country ?? null}::text, ${row.device ?? null}::text
        WHERE ${visitorId}::text IS NOT NULL
        ON CONFLICT (visitor_id) DO UPDATE SET
          last_seen = now(),
          country = COALESCE(EXCLUDED.country, flow_visitors.country),
          device = COALESCE(EXCLUDED.device, flow_visitors.device)
      )
      INSERT INTO flow_events (
        type, visitor_id, session_id, name, country, device, referrer, model, ok, error_code,
        input_tokens, output_tokens, reasoning_tokens, total_tokens, cost_usd, duration_ms, props
      ) VALUES (
        ${row.type}, ${visitorId}, ${row.sessionId ?? null}, ${row.name ?? null}, ${row.country ?? null},
        ${row.device ?? null}, ${row.referrer ?? null}, ${row.model ?? null}, ${row.ok ?? null}, ${row.errorCode ?? null},
        ${int(row.inputTokens)}, ${int(row.outputTokens)}, ${int(row.reasoningTokens)}, ${int(row.totalTokens)},
        ${Number(row.costUsd) || 0}, ${row.durationMs == null ? null : int(row.durationMs)},
        ${row.props ? JSON.stringify(row.props) : null}::jsonb
      )`;
  } catch (error) {
    console.error('[analytics] could not record an event:', error instanceof Error ? error.message : error);
  }
}
