import Link from 'next/link';
import { AlertTriangle, Database, LogOut, RefreshCw } from 'lucide-react';
import { requireAdmin } from '@/lib/admin/auth';
import { isAnalyticsConfigured } from '@/lib/analytics/db';
import { RANGES, loadDashboard, parseRange, type Dashboard, type RangeKey } from '@/lib/admin/metrics';
import { ERROR_LABELS, PAGE_LABELS, STEP_LABELS, actionLabel } from '@/lib/analytics/events';
import { formatDateTime, formatDuration, timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Notice, Panel, PanelHeader } from '@/components/ui/primitives';
import { signOut } from './actions';
import { ActivityChart } from './_components/activity-chart';
import { ExcludeToggle } from './_components/exclude-toggle';
import {
  AdminMark,
  BarList,
  Figure,
  Funnel,
  KpiTile,
  TileGrid,
  Section,
  Table,
  compact,
  countryName,
  money,
  percent,
  seconds,
  shortId,
} from './_components/parts';

/**
 * The admin dashboard.
 *
 * Built to be read top to bottom by someone who is not an analyst: the
 * headline numbers first, then how people move through the product, then
 * where the tokens go, then who the users are. Every panel says in one line
 * what it measures.
 */

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin();

  const range = parseRange((await searchParams).range);

  if (!isAnalyticsConfigured()) {
    return (
      <AdminFrame range={range}>
        <SetupPanel />
      </AdminFrame>
    );
  }

  let data: Dashboard;
  try {
    data = await loadDashboard(range);
  } catch (error) {
    return (
      <AdminFrame range={range}>
        <Notice tone="negative" icon={<AlertTriangle />} title="The analytics database could not be read">
          {error instanceof Error ? error.message : 'Unknown error.'} Check that DATABASE_URL points at a reachable Postgres
          database, then reload.
        </Notice>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame range={range} generatedAt={data.generatedAt}>
      <Overview data={data} />
    </AdminFrame>
  );
}

/* ---------------------------------------------------------------- frame */

function AdminFrame({ range, generatedAt, children }: { range: RangeKey; generatedAt?: string; children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
          <AdminMark />
          <div className="flex-1" />

          <nav aria-label="Period" className="flex rounded-[var(--radius-control)] border border-[var(--color-border-strong)] p-0.5">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <Link
                key={key}
                href={`/admin?range=${key}`}
                aria-current={key === range ? 'page' : undefined}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-[0.8125rem] transition-colors duration-[120ms]',
                  key === range
                    ? 'bg-[var(--color-accent)] font-medium text-[var(--color-accent-contrast)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                )}
              >
                {RANGES[key].short}
              </Link>
            ))}
          </nav>

          <Button asChild variant="ghost" size="iconSm" aria-label="Refresh">
            <Link href={`/admin?range=${range}`} prefetch={false}>
              <RefreshCw />
            </Link>
          </Button>

          <form action={signOut}>
            <Button type="submit" variant="secondary" size="sm">
              <LogOut />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-10 px-4 py-6 lg:px-6">
        <div className="space-y-1">
          <h1 className="text-[1.5rem] leading-tight text-[var(--color-text)]">{RANGES[range].label}</h1>
          <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
            Arrows compare with {RANGES[range].previous}. Times are UTC.
            {generatedAt && <> Updated {formatDateTime(generatedAt)}</>}
          </p>
        </div>
        {children}
      </main>
    </>
  );
}

function SetupPanel() {
  return (
    <Panel>
      <PanelHeader
        title="Connect a database to start counting"
        description="You are signed in, but there is nowhere to store usage yet. Nothing is being recorded until a database is connected."
      />
      <div className="space-y-4 px-5 py-5 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            In your Vercel project, open <span className="font-medium text-[var(--color-text)]">Storage</span> →{' '}
            <span className="font-medium text-[var(--color-text)]">Create database</span> →{' '}
            <span className="font-medium text-[var(--color-text)]">Neon (Postgres)</span>, and connect it to this project.
          </li>
          <li>
            That sets <code className="font-[family-name:var(--font-mono)] text-[var(--color-text)]">DATABASE_URL</code> automatically.
            Redeploy so the app picks it up.
          </li>
          <li>Open the app in another tab. Visits, runs, and tokens start appearing here within seconds. The tables create themselves.</li>
        </ol>
        <Notice tone="neutral" icon={<Database />}>
          Any Postgres database works — set <code className="font-[family-name:var(--font-mono)]">DATABASE_URL</code> to its
          connection string.
        </Notice>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- overview */

function Overview({ data }: { data: Dashboard }) {
  const { current: c, previous: p } = data;
  const unit = RANGES[data.range].unit;
  const demoRuns = c.runs - c.liveRuns;
  const stickiness = data.active.month ? data.active.day / data.active.month : 0;

  return (
    <>
      {/* 1 — the headline */}
      <Section title="At a glance" description="The numbers most worth checking every day.">
        <TileGrid className="grid-cols-2 md:grid-cols-4">
          <KpiTile label="Users" value={compact(c.users)} current={c.users} previous={p.users} hint="unique browsers" />
          <KpiTile label="New users" value={compact(c.newUsers)} current={c.newUsers} previous={p.newUsers} hint="first visit this period" />
          <KpiTile label="Visits" value={compact(c.visits)} current={c.visits} previous={p.visits} hint={`${compact(c.pageViews)} page views`} />
          <KpiTile
            label="Tokens spent"
            value={compact(c.tokens)}
            current={c.tokens}
            previous={p.tokens}
            hint={`≈ ${money(c.cost)} on users' own keys`}
          />
          <KpiTile
            label="Runs started"
            value={compact(c.runs)}
            current={c.runs}
            previous={p.runs}
            hint={`${compact(c.liveRuns)} live · ${compact(demoRuns)} demo`}
          />
          <KpiTile label="Drafts produced" value={compact(c.drafts)} current={c.drafts} previous={p.drafts} hint="targets that finished" />
          <KpiTile
            label="Users who ran AI for real"
            value={compact(c.liveUsers)}
            current={c.liveUsers}
            previous={p.liveUsers}
            hint={`${percent(c.liveUsers, c.users)} of users`}
          />
          <KpiTile
            label="Failed model calls"
            value={percent(c.modelErrors, c.modelCalls)}
            current={c.modelErrors}
            previous={p.modelErrors}
            inverse
            hint={`${compact(c.modelErrors)} of ${compact(c.modelCalls)} calls`}
          />
        </TileGrid>
      </Section>

      {/* 2 — right now and all time */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Active users" description="People who did anything in the app, counted over fixed windows ending now.">
          <TileGrid className="grid-cols-2 sm:grid-cols-4">
            <Figure label="Right now" value={compact(data.active.now)} hint="last 5 minutes" />
            <Figure label="Today" value={compact(data.active.day)} hint="last 24 hours" />
            <Figure label="This week" value={compact(data.active.week)} hint="last 7 days" />
            <Figure
              label="This month"
              value={compact(data.active.month)}
              hint={stickiness ? `${percent(data.active.day, data.active.month)} come back daily` : 'last 30 days'}
            />
          </TileGrid>
        </Section>

        <Section title="All time" description="Everything since tracking started.">
          <TileGrid className="grid-cols-2 sm:grid-cols-4">
            <Figure label="Users" value={compact(data.allTime.users)} />
            <Figure label="Tokens" value={compact(data.allTime.tokens)} hint={`≈ ${money(data.allTime.cost)}`} />
            <Figure label="Runs" value={compact(data.allTime.runs)} />
            <Figure label="Tracking since" value={data.allTime.since ? timeAgo(data.allTime.since) : '—'} />
          </TileGrid>
        </Section>
      </div>

      {/* 3 — over time */}
      <Section title="Activity over time" description={`One bar per ${unit}. Hover a bar to see its exact value.`}>
        <Panel>
          <ActivityChart series={data.series} unit={unit} />
        </Panel>
      </Section>

      {/* 4 — how people use it */}
      <Section
        title="How people really use Flow"
        description="Where people get to, how often they come back, and what they actually do once they are in."
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader
              title="The journey"
              description="Of everyone active in this period, how many have ever reached each step. The biggest drop is where people get stuck."
            />
            <Funnel
              steps={[
                { label: 'Opened the app', hint: 'any visit', value: data.funnel.visited },
                { label: 'Created an applicant', hint: 'described who is applying', value: data.funnel.applicant },
                { label: 'Added targets', hint: 'one by one or by import', value: data.funnel.targets },
                { label: 'Started a run', hint: 'demo or live', value: data.funnel.ran },
                { label: 'Added their own API key', hint: 'ready to run for real', value: data.funnel.key },
                { label: 'Got a real AI result', hint: 'a successful live pipeline step', value: data.funnel.live },
              ]}
            />
          </Panel>

          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Engagement" description="How much people use Flow when they come." />
              <TileGrid flat className="grid-cols-2">
                <Figure
                  label="Returning users"
                  value={percent(data.engagement.returningUsers, data.engagement.usersInRange)}
                  hint={`${compact(data.engagement.returningUsers)} came on 2+ different days`}
                />
                <Figure label="Visits per user" value={data.engagement.visitsPerUser.toFixed(1)} hint="average this period" />
                <Figure label="Screens per visit" value={data.engagement.pagesPerVisit.toFixed(1)} hint="average this period" />
                <Figure label="Average visit length" value={seconds(data.engagement.avgVisitSeconds)} hint="first to last activity" />
              </TileGrid>
            </Panel>

            <Panel>
              <PanelHeader title="Most visited screens" description="Page views per screen." />
              <BarList
                rows={data.pages.map((page) => ({
                  label: PAGE_LABELS[page.name] ?? page.name,
                  value: page.views,
                  aside: `${compact(page.users)} users`,
                }))}
              />
            </Panel>
          </div>
        </div>

        <Panel>
          <PanelHeader title="What people do" description="Every save, import, and edit, counted by kind. Nothing about what was written is stored." />
          <Table
            columns={[{ label: 'Action' }, { label: 'Times', align: 'right' }, { label: 'Users', align: 'right' }, { label: 'Per user', align: 'right' }]}
            rows={data.actions.map((action) => [
              actionLabel(action.name),
              compact(action.times),
              compact(action.users),
              action.users ? (action.times / action.users).toFixed(1) : '—',
            ])}
          />
        </Panel>
      </Section>

      {/* 5 — tokens */}
      <Section
        title="Tokens and cost"
        description="Measured on the server from OpenAI's own usage report. Visitors pay with their own keys, so cost is what they spent, estimated from list prices."
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel>
            <PanelHeader title="By model" />
            <Table
              columns={[
                { label: 'Model' },
                { label: 'Calls', align: 'right' },
                { label: 'Tokens', align: 'right' },
                { label: 'Est. cost', align: 'right' },
                { label: 'Avg time', align: 'right' },
                { label: 'Failed', align: 'right' },
              ]}
              rows={data.models.map((model) => [
                <span key="m" className="font-[family-name:var(--font-mono)] text-[0.8125rem]">
                  {model.model}
                </span>,
                compact(model.calls),
                compact(model.tokens),
                money(model.cost),
                formatDuration(Math.round(model.avgMs)),
                percent(model.errors, model.calls),
              ])}
              empty="No model calls in this period. Demo runs do not call a model, so they do not appear here."
            />
          </Panel>

          <Panel>
            <PanelHeader title="By pipeline step" description="Which part of the process uses the most." />
            <Table
              columns={[
                { label: 'Step' },
                { label: 'Calls', align: 'right' },
                { label: 'Tokens', align: 'right' },
                { label: 'Est. cost', align: 'right' },
                { label: 'Avg time', align: 'right' },
              ]}
              rows={data.steps.map((step) => [
                STEP_LABELS[step.name] ?? step.name,
                compact(step.calls),
                compact(step.tokens),
                money(step.cost),
                formatDuration(Math.round(step.avgMs)),
              ])}
              empty="No model calls in this period."
            />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Runs" description="What happened to the runs people started." />
            <TileGrid flat className="grid-cols-2 sm:grid-cols-3">
              <Figure label="Finished cleanly" value={compact(data.runs.completed)} hint={percent(data.runs.completed, data.runs.finished) + ' of finished runs'} />
              <Figure label="Partly done" value={compact(data.runs.partial)} hint="some targets failed" />
              <Figure label="Failed" value={compact(data.runs.failed)} hint="no target finished" />
              <Figure label="Cancelled" value={compact(data.runs.cancelled)} />
              <Figure label="Targets per run" value={data.runs.avgTargets.toFixed(1)} hint="average" />
              <Figure
                label="Typical run length"
                value={data.runs.avgDurationMs ? formatDuration(Math.round(data.runs.avgDurationMs)) : '—'}
                hint="average"
              />
            </TileGrid>
            <p className="border-t border-[var(--color-border)] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-faint)]">
              {compact(data.runs.started - data.runs.finished > 0 ? data.runs.started - data.runs.finished : 0)} runs never reported an
              ending, usually because the tab was closed mid-run. {percent(data.runs.demoStarted, data.runs.started)} of runs were demo
              runs, which cost nothing.
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Why model calls failed" description="Most failures are on the user's side, not the app's." />
            <BarList
              rows={data.errors.map((error) => ({ label: ERROR_LABELS[error.code] ?? error.code, value: error.count }))}
              empty="No failed model calls in this period."
            />
          </Panel>
        </div>
      </Section>

      {/* 6 — audience */}
      <Section title="Who the users are" description="Country comes from Vercel's network edge; no IP address is ever stored.">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Panel>
            <PanelHeader title="Countries" />
            <BarList rows={data.countries.map((row) => ({ label: countryName(row.key), value: row.users, aside: 'users' }))} />
          </Panel>
          <Panel>
            <PanelHeader title="Devices" />
            <BarList
              rows={data.devices.map((row) => ({
                label: <span className="capitalize">{row.key}</span>,
                value: row.users,
                display: percent(row.users, data.devices.reduce((sum, d) => sum + d.users, 0)),
              }))}
            />
          </Panel>
          <Panel>
            <PanelHeader title="Where visits come from" description="Other websites that linked here." />
            <BarList
              rows={data.referrers.map((row) => ({ label: row.key, value: row.visits, aside: 'visits' }))}
              empty="No referring sites yet. Direct visits and bookmarks are not listed."
            />
          </Panel>
        </div>

        <Panel>
          <PanelHeader
            title="Most active users"
            description="Anonymous: each id is a random number one browser picked for itself. Sorted by tokens spent, then visits."
          />
          <Table
            columns={[
              { label: 'User' },
              { label: 'Where' },
              { label: 'First seen' },
              { label: 'Last active' },
              { label: 'Visits', align: 'right' },
              { label: 'Runs', align: 'right' },
              { label: 'Tokens', align: 'right' },
              { label: 'Est. cost', align: 'right' },
            ]}
            rows={data.topUsers.map((user) => [
              <span key="id" className="font-[family-name:var(--font-mono)] text-[0.8125rem]">
                {shortId(user.visitorId)}
              </span>,
              <span key="where" className="text-[var(--color-text-muted)]">
                {countryName(user.country)}
                {user.device ? ` · ${user.device}` : ''}
              </span>,
              <span key="first" className="text-[var(--color-text-muted)]">
                {timeAgo(user.firstSeen)}
              </span>,
              <span key="last" className="text-[var(--color-text-muted)]">
                {timeAgo(user.lastSeen)}
              </span>,
              compact(user.visits),
              compact(user.runs),
              compact(user.tokens),
              money(user.cost),
            ])}
          />
        </Panel>
      </Section>

      {/* 7 — live feed */}
      <Section title="Latest activity" description="The 25 most recent things that happened, newest first.">
        <Panel>
          <Table
            columns={[{ label: 'When' }, { label: 'User' }, { label: 'What happened' }, { label: 'Tokens', align: 'right' }]}
            rows={data.recent.map((event) => [
              <span key="at" className="whitespace-nowrap text-[var(--color-text-muted)]" title={formatDateTime(event.at)}>
                {timeAgo(event.at)}
              </span>,
              <span key="who" className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[0.8125rem] text-[var(--color-text-muted)]">
                {shortId(event.visitorId)}
                {event.country ? ` · ${event.country}` : ''}
              </span>,
              <EventDescription key="what" event={event} />,
              event.tokens ? compact(event.tokens) : '',
            ])}
            empty="Nothing recorded yet. Open the app in another tab and it will show up here."
          />
        </Panel>
      </Section>

      {/* 8 — fine print */}
      <Section title="About these numbers">
        <Panel className="grid gap-x-8 gap-y-1 px-5 py-4 lg:grid-cols-2">
          <ul className="space-y-2 py-2 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
            <li>
              <span className="font-medium text-[var(--color-text)]">A user is a browser.</span> Flow has no accounts, so one person on
              a laptop and a phone counts as two, and clearing site data starts a new user.
            </li>
            <li>
              <span className="font-medium text-[var(--color-text)]">A visit</span> ends after 30 minutes without activity.
            </li>
            <li>
              <span className="font-medium text-[var(--color-text)]">Nothing personal is stored:</span> no names, CVs, prompts, drafts,
              API keys, or IP addresses — only which screen, which kind of action, and how many tokens.
            </li>
          </ul>
          <div className="border-t border-[var(--color-border)] lg:border-l lg:border-t-0 lg:pl-8">
            <ExcludeToggle />
          </div>
        </Panel>
      </Section>
    </>
  );
}

function EventDescription({ event }: { event: Dashboard['recent'][number] }) {
  if (event.type === 'page_view') {
    return <span>Opened {PAGE_LABELS[event.name ?? ''] ?? event.name}</span>;
  }

  if (event.type === 'action') return <span>{actionLabel(event.name ?? '')}</span>;

  if (event.type === 'run_started') {
    const targets = Number(event.props?.targets ?? 0);
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        Started a run on {targets} target{targets === 1 ? '' : 's'}
        {event.props?.demo === true && <Badge tone="neutral">demo</Badge>}
      </span>
    );
  }

  if (event.type === 'run_finished') {
    const status = String(event.props?.status ?? '');
    const tone = status === 'completed' ? 'positive' : status === 'cancelled' ? 'muted' : status === 'partial' ? 'warning' : 'negative';
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        Run ended: {Number(event.props?.succeeded ?? 0)} of {Number(event.props?.targets ?? 0)} done
        <Badge tone={tone}>{status}</Badge>
      </span>
    );
  }

  if (event.type === 'model_call') {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {STEP_LABELS[event.name ?? ''] ?? event.name} on{' '}
        <span className="font-[family-name:var(--font-mono)] text-[0.8125rem]">{event.model}</span>
        {event.ok === false && <Badge tone="negative">{ERROR_LABELS[event.errorCode ?? 'other'] ?? 'failed'}</Badge>}
      </span>
    );
  }

  return <span>{event.type}</span>;
}
