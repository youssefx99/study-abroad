'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  UserRound,
  Target,
  SquareTerminal,
  Workflow,
  PlayCircle,
  Settings,
  Moon,
  Sun,
  Menu,
  X,
  CircleDot,
  KeyRound,
} from 'lucide-react';
import { fetcher, CLOUD_MODE } from '@/lib/api';
import { useApiKeyState } from '@/components/api-key-card';
import type { HealthReport, Overview } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Tooltip } from '@/components/ui/primitives';

/**
 * The application shell.
 *
 * A single left rail carries the whole product. The order of the sections is
 * the order of the work — describe yourself, list who you are writing to, own
 * the prompts, arrange them, run, read the results — so the navigation doubles
 * as an explanation of what the tool does.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Where everything stands' }],
  },
  {
    label: 'Your data',
    items: [
      { href: '/applicants', label: 'Applicants', icon: UserRound, description: 'Who is applying' },
      { href: '/targets', label: 'Targets', icon: Target, description: 'Who you are writing to' },
    ],
  },
  {
    label: 'How it works',
    items: [
      { href: '/prompts', label: 'Prompts', icon: SquareTerminal, description: 'What the model is asked' },
      { href: '/pipelines', label: 'Pipelines', icon: Workflow, description: 'The order of the steps' },
    ],
  },
  {
    label: 'Output',
    items: [{ href: '/runs', label: 'Runs', icon: PlayCircle, description: 'Progress and drafts' }],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Mobile scrim */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[rgb(16_23_36/0.4)] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform duration-200 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <FlowMark />
            <span className="font-[family-name:var(--font-display)] text-[0.9375rem] font-semibold tracking-tight text-[var(--color-text)]">
              Flow
            </span>
          </Link>
          <Button variant="ghost" size="iconSm" className="lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X />
          </Button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <p className="px-2.5 pb-1 text-[0.6875rem] font-medium text-[var(--color-text-faint)]">{group.label}</p>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[0.8125rem] transition-colors duration-[120ms]',
                      active
                        ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text)]',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] p-3">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[0.8125rem] transition-colors duration-[120ms]',
              pathname.startsWith('/settings')
                ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text)]',
            )}
          >
            <Settings className="size-4" />
            Settings
          </Link>
          {!CLOUD_MODE && <SystemStatus />}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] px-4 backdrop-blur-md lg:px-6">
          <Button variant="ghost" size="iconSm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>

          <div className="flex-1" />
          <DemoModeIndicator />
          <ThemeToggle />
          <Button asChild size="sm" variant="primary">
            <Link href="/runs/new">
              <PlayCircle />
              New run
            </Link>
          </Button>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

/**
 * The mark: three stacked rules of decreasing length. It reads as a list being
 * processed, which is what the product does, and it survives at 20px.
 */
function FlowMark() {
  return (
    <span className="flex size-6 items-center justify-center rounded-[6px] bg-[var(--color-accent)]" aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
        <path
          d="M3 4h10M3 8h7M3 12h4"
          stroke="var(--color-accent-contrast)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // The server cannot know the browser's theme, so the icon renders only after
  // hydration. Without this the markup mismatches and React warns.
  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="size-7" />;

  const isDark = resolvedTheme === 'dark';

  return (
    <Tooltip label={isDark ? 'Switch to light' : 'Switch to dark'}>
      <Button variant="ghost" size="iconSm" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label="Toggle theme">
        {isDark ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}

/**
 * Demo mode is announced permanently, not once. Someone who missed a banner and
 * then wonders why every draft says "demo" has lost real time.
 */
function DemoModeIndicator() {
  const { data } = useSWR<Overview>('/api/overview', fetcher, { refreshInterval: 30_000 });
  const keyState = useApiKeyState();

  // Hosted, the absence of a key is the single most useful thing to surface:
  // it is the one step between the visitor and a real draft, and only they can
  // supply it.
  if (CLOUD_MODE && !keyState.present) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href="/settings">
          <KeyRound />
          Add your API key
        </Link>
      </Button>
    );
  }

  if (!data?.demoModeActive) return null;

  return (
    <Tooltip label="No API key is configured, so every stage returns representative output instead of calling a model. Add a key under Settings to run for real.">
      <Link href="/settings">
        <Badge tone="warning" className="cursor-pointer">
          <CircleDot className="size-3" />
          Demo mode
        </Badge>
      </Link>
    </Tooltip>
  );
}

/** Service health, polled quietly. A stopped service explains itself here. */
function SystemStatus() {
  const { data, error } = useSWR<HealthReport>('/api/health', fetcher, {
    refreshInterval: 20_000,
    shouldRetryOnError: true,
  });

  const status = error ? 'down' : (data?.status ?? 'loading');
  const down = data?.services.filter((s) => s.status !== 'ok') ?? [];

  const tone =
    status === 'ok'
      ? 'text-[var(--color-signal)]'
      : status === 'loading'
        ? 'text-[var(--color-text-faint)]'
        : status === 'degraded'
          ? 'text-[var(--color-amber)]'
          : 'text-[var(--color-rose)]';

  const label =
    status === 'ok'
      ? 'All services running'
      : status === 'loading'
        ? 'Checking services'
        : status === 'degraded'
          ? `${down.length} service${down.length === 1 ? '' : 's'} down: ${down.map((s) => s.label).join(', ')}`
          : 'Cannot reach the gateway. Run "npm run dev" from the project root.';

  return (
    <Tooltip label={label}>
      <Link
        href="/settings?tab=system"
        className="mt-1 flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[0.6875rem] text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface-sunken)]"
      >
        <span className={cn('size-1.5 rounded-full bg-current', tone, status !== 'ok' && status !== 'loading' && 'animate-working')} />
        <span className="truncate">
          {status === 'ok' ? '8 services' : status === 'loading' ? 'Checking…' : status === 'degraded' ? `${down.length} down` : 'Offline'}
        </span>
      </Link>
    </Tooltip>
  );
}
