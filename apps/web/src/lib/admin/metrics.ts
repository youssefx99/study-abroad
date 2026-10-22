import 'server-only';
import { getSql } from '@/lib/analytics/db';

/**
 * Every number on the admin screen, computed from the event log.
 *
 * "A user" is one browser: there are no accounts, so a person on two devices
 * counts twice and a person who clears their storage starts again. That is
 * stated on the screen rather than hidden in here.
 */

export const RANGES = {
  '24h': { label: 'Last 24 hours', short: '24h', unit: 'hour', buckets: 24, previous: 'the 24 hours before' },
  '7d': { label: 'Last 7 days', short: '7 days', unit: 'day', buckets: 7, previous: 'the 7 days before' },
  '30d': { label: 'Last 30 days', short: '30 days', unit: 'day', buckets: 30, previous: 'the 30 days before' },
  '90d': { label: 'Last 90 days', short: '90 days', unit: 'day', buckets: 90, previous: 'the 90 days before' },
} as const;

export type RangeKey = keyof typeof RANGES;

export function parseRange(value: string | undefined): RangeKey {
  return value && value in RANGES ? (value as RangeKey) : '30d';
}

/**
 * Windows start on a whole hour or a whole UTC day, so each chart bar is one
 * complete bucket. "Previous" is the same length immediately before, which is
 * what the up/down comparisons are measured against.
 */
function windowFor(range: RangeKey) {
  const { unit, buckets } = RANGES[range];
  const now = new Date();
  const start = new Date(now);

  if (unit === 'hour') {
    start.setUTCMinutes(0, 0, 0);
    start.setUTCHours(start.getUTCHours() - (buckets - 1));
  } else {
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (buckets - 1));
  }

  const span = now.getTime() - start.getTime();
  return {
    unit,
    from: start.toISOString(),
    to: now.toISOString(),
    prevFrom: new Date(start.getTime() - span).toISOString(),
  };
}

const n = (value: unknown) => Number(value ?? 0) || 0;

export interface Totals {
  users: number;
  visits: number;
  pageViews: number;
  runs: number;
  liveRuns: number;
  drafts: number;
  tokens: number;
  cost: number;
  modelCalls: number;
  modelErrors: number;
  liveUsers: number;
  newUsers: number;
}

export interface Dashboard {
  range: RangeKey;
  generatedAt: string;
  current: Totals;
  previous: Totals;
  allTime: { users: number; tokens: number; cost: number; runs: number; since: string | null };
  active: { now: number; day: number; week: number; month: number };
  engagement: { returningUsers: number; usersInRange: number; visitsPerUser: number; pagesPerVisit: number; avgVisitSeconds: number };
  series: { bucket: string; users: number; visits: number; tokens: number; cost: number; runs: number }[];
  funnel: { visited: number; applicant: number; targets: number; ran: number; key: number; live: number };
  actions: { name: string; times: number; users: number }[];
  pages: { name: string; views: number; users: number }[];
  models: { model: string; calls: number; errors: number; tokens: number; cost: number; avgMs: number }[];
  steps: { name: string; calls: number; tokens: number; cost: number; avgMs: number }[];
  errors: { code: string; count: number }[];
  runs: {
    started: number;
    demoStarted: number;
    finished: number;
    completed: number;
    partial: number;
    failed: number;
    cancelled: number;
    avgTargets: number;
    targetsSucceeded: number;
    targetsFailed: number;
    avgDurationMs: number;
  };
  countries: { key: string; users: number }[];
  devices: { key: string; users: number }[];
  referrers: { key: string; visits: number }[];
  topUsers: {
    visitorId: string;
    firstSeen: string;
    lastSeen: string;
    visits: number;
    runs: number;
    tokens: number;
    cost: number;
    country: string | null;
    device: string | null;
  }[];
  recent: {
    at: string;
    type: string;
    name: string | null;
    model: string | null;
    tokens: number;
    ok: boolean | null;
    errorCode: string | null;
    visitorId: string | null;
    country: string | null;
    props: Record<string, unknown> | null;
  }[];
}

export async function loadDashboard(range: RangeKey): Promise<Dashboard> {
  const sql = await getSql();
  if (!sql) throw new Error('No analytics database is configured.');

  const { unit, from, to, prevFrom } = windowFor(range);
  const step = `1 ${unit}`;

  const totalsBetween = (start: string, end: string) => sql`
    SELECT
      COUNT(DISTINCT visitor_id)::int AS users,
      COUNT(DISTINCT session_id) FILTER (WHERE type = 'page_view')::int AS visits,
      COUNT(*) FILTER (WHERE type = 'page_view')::int AS page_views,
      COUNT(*) FILTER (WHERE type = 'run_started')::int AS runs,
      COUNT(*) FILTER (WHERE type = 'run_started' AND (props->>'demo')::boolean IS NOT TRUE)::int AS live_runs,
      COALESCE(SUM((props->>'succeeded')::int) FILTER (WHERE type = 'run_finished'), 0)::int AS drafts,
      COALESCE(SUM(total_tokens) FILTER (WHERE type = 'model_call'), 0)::float8 AS tokens,
      COALESCE(SUM(cost_usd) FILTER (WHERE type = 'model_call'), 0)::float8 AS cost,
      COUNT(*) FILTER (WHERE type = 'model_call')::int AS model_calls,
      COUNT(*) FILTER (WHERE type = 'model_call' AND ok = false)::int AS model_errors,
      COUNT(DISTINCT visitor_id) FILTER (WHERE type = 'model_call' AND ok)::int AS live_users
    FROM flow_events
    WHERE at >= ${start}::timestamptz AND at < ${end}::timestamptz`;

  const inRange = sql`at >= ${from}::timestamptz AND at < ${to}::timestamptz`;

  const [
    current,
    previous,
    newUsers,
    allTime,
    active,
    perVisitor,
    perVisit,
    series,
    funnel,
    actions,
    pages,
    models,
    steps,
    errors,
    runs,
    countries,
    devices,
    referrers,
    topUsers,
    recent,
  ] = await Promise.all([
    totalsBetween(from, to),
    totalsBetween(prevFrom, from),
    sql`
      SELECT
        COUNT(*) FILTER (WHERE first_seen >= ${from}::timestamptz)::int AS current,
        COUNT(*) FILTER (WHERE first_seen >= ${prevFrom}::timestamptz AND first_seen < ${from}::timestamptz)::int AS previous
      FROM flow_visitors`,
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM flow_visitors) AS users,
        (SELECT COALESCE(SUM(total_tokens), 0)::float8 FROM flow_events WHERE type = 'model_call') AS tokens,
        (SELECT COALESCE(SUM(cost_usd), 0)::float8 FROM flow_events WHERE type = 'model_call') AS cost,
        (SELECT COUNT(*)::int FROM flow_events WHERE type = 'run_started') AS runs,
        (SELECT MIN(at) FROM flow_events) AS since`,
    sql`
      SELECT
        COUNT(DISTINCT visitor_id) FILTER (WHERE at >= now() - interval '5 minutes')::int AS now,
        COUNT(DISTINCT visitor_id) FILTER (WHERE at >= now() - interval '1 day')::int AS day,
        COUNT(DISTINCT visitor_id) FILTER (WHERE at >= now() - interval '7 days')::int AS week,
        COUNT(DISTINCT visitor_id)::int AS month
      FROM flow_events WHERE at >= now() - interval '30 days'`,
    sql`
      SELECT
        COUNT(*)::int AS users,
        COUNT(*) FILTER (WHERE days >= 2)::int AS returning,
        COALESCE(AVG(visits), 0)::float8 AS visits_per_user
      FROM (
        SELECT visitor_id,
          COUNT(DISTINCT date_trunc('day', at AT TIME ZONE 'UTC')) AS days,
          COUNT(DISTINCT session_id) AS visits
        FROM flow_events WHERE ${inRange} AND visitor_id IS NOT NULL
        GROUP BY visitor_id
      ) v`,
    sql`
      SELECT
        COALESCE(AVG(pages), 0)::float8 AS pages_per_visit,
        COALESCE(AVG(EXTRACT(EPOCH FROM last_at - first_at)), 0)::float8 AS avg_seconds
      FROM (
        SELECT session_id, COUNT(*) FILTER (WHERE type = 'page_view') AS pages, MIN(at) AS first_at, MAX(at) AS last_at
        FROM flow_events WHERE ${inRange} AND session_id IS NOT NULL
        GROUP BY session_id
      ) s WHERE pages > 0`,
    sql`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${unit}, ${from}::timestamptz AT TIME ZONE 'UTC'),
          date_trunc(${unit}, ${to}::timestamptz AT TIME ZONE 'UTC'),
          ${step}::interval
        ) AS bucket
      ),
      agg AS (
        SELECT date_trunc(${unit}, at AT TIME ZONE 'UTC') AS bucket,
          COUNT(DISTINCT visitor_id)::int AS users,
          COUNT(DISTINCT session_id) FILTER (WHERE type = 'page_view')::int AS visits,
          COALESCE(SUM(total_tokens) FILTER (WHERE type = 'model_call'), 0)::float8 AS tokens,
          COALESCE(SUM(cost_usd) FILTER (WHERE type = 'model_call'), 0)::float8 AS cost,
          COUNT(*) FILTER (WHERE type = 'run_started')::int AS runs
        FROM flow_events WHERE ${inRange}
        GROUP BY 1
      )
      SELECT to_char(b.bucket, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket,
        COALESCE(a.users, 0) AS users, COALESCE(a.visits, 0) AS visits,
        COALESCE(a.tokens, 0) AS tokens, COALESCE(a.cost, 0) AS cost, COALESCE(a.runs, 0) AS runs
      FROM buckets b LEFT JOIN agg a USING (bucket)
      ORDER BY b.bucket`,
    // Of the people active in this period, how many have ever reached each
    // stage — lifetime, so someone who set up last month and ran today counts.
    sql`
      WITH active AS (
        SELECT DISTINCT visitor_id FROM flow_events WHERE ${inRange} AND visitor_id IS NOT NULL
      ),
      reached AS (
        SELECT e.visitor_id,
          bool_or(e.type = 'action' AND e.name = 'profile.create') AS applicant,
          bool_or(e.type = 'action' AND e.name IN ('target.create', 'targets.import')) AS targets,
          bool_or(e.type = 'run_started') AS ran,
          bool_or(e.type = 'action' AND e.name = 'api_key.save') AS key,
          bool_or(e.type = 'model_call' AND e.ok AND e.name NOT IN ('key_check', 'cv_import')) AS live
        FROM flow_events e JOIN active USING (visitor_id)
        GROUP BY e.visitor_id
      )
      SELECT
        COUNT(*)::int AS visited,
        COUNT(*) FILTER (WHERE applicant)::int AS applicant,
        COUNT(*) FILTER (WHERE targets)::int AS targets,
        COUNT(*) FILTER (WHERE ran)::int AS ran,
        COUNT(*) FILTER (WHERE key)::int AS key,
        COUNT(*) FILTER (WHERE live)::int AS live
      FROM reached`,
    sql`
      SELECT name, COUNT(*)::int AS times, COUNT(DISTINCT visitor_id)::int AS users
      FROM flow_events WHERE type = 'action' AND ${inRange}
      GROUP BY name ORDER BY times DESC LIMIT 25`,
    sql`
      SELECT name, COUNT(*)::int AS views, COUNT(DISTINCT visitor_id)::int AS users
      FROM flow_events WHERE type = 'page_view' AND ${inRange}
      GROUP BY name ORDER BY views DESC LIMIT 12`,
    sql`
      SELECT COALESCE(model, 'unknown') AS model, COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE ok = false)::int AS errors,
        COALESCE(SUM(total_tokens), 0)::float8 AS tokens, COALESCE(SUM(cost_usd), 0)::float8 AS cost,
        COALESCE(AVG(duration_ms), 0)::float8 AS avg_ms
      FROM flow_events WHERE type = 'model_call' AND ${inRange}
      GROUP BY 1 ORDER BY tokens DESC, calls DESC`,
    sql`
      SELECT COALESCE(name, 'unknown') AS name, COUNT(*)::int AS calls,
        COALESCE(SUM(total_tokens), 0)::float8 AS tokens, COALESCE(SUM(cost_usd), 0)::float8 AS cost,
        COALESCE(AVG(duration_ms), 0)::float8 AS avg_ms
      FROM flow_events WHERE type = 'model_call' AND ${inRange}
      GROUP BY 1 ORDER BY tokens DESC, calls DESC LIMIT 12`,
    sql`
      SELECT COALESCE(error_code, 'other') AS code, COUNT(*)::int AS count
      FROM flow_events WHERE type = 'model_call' AND ok = false AND ${inRange}
      GROUP BY 1 ORDER BY count DESC`,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE type = 'run_started')::int AS started,
        COUNT(*) FILTER (WHERE type = 'run_started' AND (props->>'demo')::boolean)::int AS demo_started,
        COUNT(*) FILTER (WHERE type = 'run_finished')::int AS finished,
        COUNT(*) FILTER (WHERE type = 'run_finished' AND props->>'status' = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE type = 'run_finished' AND props->>'status' = 'partial')::int AS partial,
        COUNT(*) FILTER (WHERE type = 'run_finished' AND props->>'status' = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE type = 'run_finished' AND props->>'status' = 'cancelled')::int AS cancelled,
        COALESCE(AVG((props->>'targets')::float8) FILTER (WHERE type = 'run_started'), 0)::float8 AS avg_targets,
        COALESCE(SUM((props->>'succeeded')::int) FILTER (WHERE type = 'run_finished'), 0)::int AS targets_succeeded,
        COALESCE(SUM((props->>'failed')::int) FILTER (WHERE type = 'run_finished'), 0)::int AS targets_failed,
        COALESCE(AVG((props->>'durationMs')::float8) FILTER (WHERE type = 'run_finished' AND props->>'status' <> 'cancelled'), 0)::float8 AS avg_duration
      FROM flow_events WHERE type IN ('run_started', 'run_finished') AND ${inRange}`,
    // Country and device per person, not per event, so someone who switches
    // network or device mid-period is still one user and the shares add up.
    sql`
      SELECT COALESCE(v.country, 'Unknown') AS key, COUNT(*)::int AS users
      FROM (SELECT DISTINCT visitor_id FROM flow_events WHERE ${inRange} AND visitor_id IS NOT NULL) a
      JOIN flow_visitors v USING (visitor_id)
      GROUP BY 1 ORDER BY users DESC LIMIT 10`,
    sql`
      SELECT COALESCE(v.device, 'desktop') AS key, COUNT(*)::int AS users
      FROM (SELECT DISTINCT visitor_id FROM flow_events WHERE ${inRange} AND visitor_id IS NOT NULL) a
      JOIN flow_visitors v USING (visitor_id)
      GROUP BY 1 ORDER BY users DESC`,
    sql`
      SELECT referrer AS key, COUNT(DISTINCT session_id)::int AS visits
      FROM flow_events WHERE type = 'page_view' AND referrer IS NOT NULL AND ${inRange}
      GROUP BY 1 ORDER BY visits DESC LIMIT 10`,
    sql`
      SELECT e.visitor_id,
        MIN(v.first_seen) AS first_seen, MAX(e.at) AS last_seen,
        COUNT(DISTINCT e.session_id)::int AS visits,
        COUNT(*) FILTER (WHERE e.type = 'run_started')::int AS runs,
        COALESCE(SUM(e.total_tokens), 0)::float8 AS tokens,
        COALESCE(SUM(e.cost_usd), 0)::float8 AS cost,
        MAX(v.country) AS country, MAX(v.device) AS device
      FROM flow_events e LEFT JOIN flow_visitors v USING (visitor_id)
      WHERE e.visitor_id IS NOT NULL AND e.at >= ${from}::timestamptz AND e.at < ${to}::timestamptz
      GROUP BY e.visitor_id
      ORDER BY tokens DESC, visits DESC, last_seen DESC
      LIMIT 15`,
    sql`
      SELECT at, type, name, model, total_tokens, ok, error_code, visitor_id, country, props
      FROM flow_events ORDER BY at DESC LIMIT 25`,
  ]);

  const totals = (row: Record<string, unknown>, fresh: number): Totals => ({
    users: n(row.users),
    visits: n(row.visits),
    pageViews: n(row.page_views),
    runs: n(row.runs),
    liveRuns: n(row.live_runs),
    drafts: n(row.drafts),
    tokens: n(row.tokens),
    cost: n(row.cost),
    modelCalls: n(row.model_calls),
    modelErrors: n(row.model_errors),
    liveUsers: n(row.live_users),
    newUsers: fresh,
  });

  const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);
  const visitor = perVisitor[0] ?? {};
  const visit = perVisit[0] ?? {};
  const run = runs[0] ?? {};
  const funnelRow = funnel[0] ?? {};

  return {
    range,
    generatedAt: new Date().toISOString(),
    current: totals(current[0] ?? {}, n(newUsers[0]?.current)),
    previous: totals(previous[0] ?? {}, n(newUsers[0]?.previous)),
    allTime: {
      users: n(allTime[0]?.users),
      tokens: n(allTime[0]?.tokens),
      cost: n(allTime[0]?.cost),
      runs: n(allTime[0]?.runs),
      since: iso(allTime[0]?.since),
    },
    active: { now: n(active[0]?.now), day: n(active[0]?.day), week: n(active[0]?.week), month: n(active[0]?.month) },
    engagement: {
      usersInRange: n(visitor.users),
      returningUsers: n(visitor.returning),
      visitsPerUser: n(visitor.visits_per_user),
      pagesPerVisit: n(visit.pages_per_visit),
      avgVisitSeconds: n(visit.avg_seconds),
    },
    series: series.map((r) => ({
      bucket: String(r.bucket),
      users: n(r.users),
      visits: n(r.visits),
      tokens: n(r.tokens),
      cost: n(r.cost),
      runs: n(r.runs),
    })),
    funnel: {
      visited: n(funnelRow.visited),
      applicant: n(funnelRow.applicant),
      targets: n(funnelRow.targets),
      ran: n(funnelRow.ran),
      key: n(funnelRow.key),
      live: n(funnelRow.live),
    },
    actions: actions.map((r) => ({ name: String(r.name), times: n(r.times), users: n(r.users) })),
    pages: pages.map((r) => ({ name: String(r.name), views: n(r.views), users: n(r.users) })),
    models: models.map((r) => ({
      model: String(r.model),
      calls: n(r.calls),
      errors: n(r.errors),
      tokens: n(r.tokens),
      cost: n(r.cost),
      avgMs: n(r.avg_ms),
    })),
    steps: steps.map((r) => ({ name: String(r.name), calls: n(r.calls), tokens: n(r.tokens), cost: n(r.cost), avgMs: n(r.avg_ms) })),
    errors: errors.map((r) => ({ code: String(r.code), count: n(r.count) })),
    runs: {
      started: n(run.started),
      demoStarted: n(run.demo_started),
      finished: n(run.finished),
      completed: n(run.completed),
      partial: n(run.partial),
      failed: n(run.failed),
      cancelled: n(run.cancelled),
      avgTargets: n(run.avg_targets),
      targetsSucceeded: n(run.targets_succeeded),
      targetsFailed: n(run.targets_failed),
      avgDurationMs: n(run.avg_duration),
    },
    countries: countries.map((r) => ({ key: String(r.key), users: n(r.users) })),
    devices: devices.map((r) => ({ key: String(r.key), users: n(r.users) })),
    referrers: referrers.map((r) => ({ key: String(r.key), visits: n(r.visits) })),
    topUsers: topUsers.map((r) => ({
      visitorId: String(r.visitor_id),
      firstSeen: iso(r.first_seen) ?? '',
      lastSeen: iso(r.last_seen) ?? '',
      visits: n(r.visits),
      runs: n(r.runs),
      tokens: n(r.tokens),
      cost: n(r.cost),
      country: (r.country as string | null) ?? null,
      device: (r.device as string | null) ?? null,
    })),
    recent: recent.map((r) => ({
      at: iso(r.at) ?? '',
      type: String(r.type),
      name: (r.name as string | null) ?? null,
      model: (r.model as string | null) ?? null,
      tokens: n(r.total_tokens),
      ok: (r.ok as boolean | null) ?? null,
      errorCode: (r.error_code as string | null) ?? null,
      visitorId: (r.visitor_id as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      props: (r.props as Record<string, unknown> | null) ?? null,
    })),
  };
}
