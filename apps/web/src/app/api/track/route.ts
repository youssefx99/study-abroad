import { after } from 'next/server';
import { CLIENT_EVENT_TYPES, RUN_STATUSES, isActionKey, type ClientEventType } from '@/lib/analytics/events';
import { cleanId, recordEvent, requestContext } from '@/lib/analytics/record';
import { isAnalyticsConfigured } from '@/lib/analytics/db';

/**
 * Accepts usage events from the browser.
 *
 * Anyone can call a public endpoint, so this trusts nothing it is sent: the
 * event type, action name, and every property are checked against a fixed
 * vocabulary, and token counts are not accepted here at all — those are only
 * ever measured by `/api/execute` itself.
 */

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 4096;
const empty = (status = 204) => new Response(null, { status });

const count = (value: unknown, max = 10_000) =>
  Number.isFinite(Number(value)) ? Math.min(max, Math.max(0, Math.round(Number(value)))) : 0;

function cleanName(type: ClientEventType, value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  if (type === 'page_view') return value.startsWith('/') ? value : null;
  if (type === 'action') return isActionKey(value) ? value : null;
  return null;
}

function cleanProps(type: ClientEventType, value: unknown): Record<string, unknown> | null {
  const props = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  if (type === 'run_started') {
    return { targets: count(props.targets), steps: count(props.steps, 50), demo: props.demo === true };
  }

  if (type === 'run_finished') {
    const status = RUN_STATUSES.includes(props.status as (typeof RUN_STATUSES)[number]) ? props.status : 'failed';
    return {
      status,
      targets: count(props.targets),
      succeeded: count(props.succeeded),
      failed: count(props.failed),
      demo: props.demo === true,
      durationMs: count(props.durationMs, 86_400_000),
    };
  }

  return null;
}

export async function POST(request: Request) {
  if (!isAnalyticsConfigured()) return empty();

  // Beacons from this app's own pages only. A browser always sends this header
  // on fetch and sendBeacon, so a cross-site page cannot inflate the numbers.
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return empty(403);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return empty(413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return empty(400);
  }

  const type = body.type as ClientEventType;
  if (!CLIENT_EVENT_TYPES.includes(type)) return empty(400);

  const visitorId = cleanId(body.visitorId);
  const sessionId = cleanId(body.sessionId);
  if (!visitorId || !sessionId) return empty(400);

  const name = cleanName(type, body.name);
  if ((type === 'page_view' || type === 'action') && !name) return empty(400);

  const context = requestContext(request);
  if (context.isBot) return empty();

  const referrer =
    typeof body.referrer === 'string' && /^[a-z0-9.-]{1,120}$/i.test(body.referrer) ? body.referrer.toLowerCase() : null;

  after(() =>
    recordEvent({
      type,
      visitorId,
      sessionId,
      name,
      referrer,
      country: context.country,
      device: context.device,
      props: cleanProps(type, body.props),
    }),
  );

  return empty();
}
