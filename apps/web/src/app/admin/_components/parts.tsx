import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Presentational pieces of the admin screen. No data fetching and no state,
 * so they render on the server and ship no JavaScript.
 */

/* ----------------------------------------------------------- formatting */

const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function compact(value: number): string {
  return value < 10_000 ? Math.round(value).toLocaleString('en-US') : compactFormat.format(value);
}

export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  const value = (part / whole) * 100;
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

export function money(value: number): string {
  if (!value) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function seconds(value: number): string {
  if (!value) return '—';
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(value % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryName(code: string | null): string {
  if (!code || code === 'Unknown') return 'Unknown';
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The visitor id is random, so its first characters are enough to tell rows apart. */
export function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : 'anonymous';
}

/* --------------------------------------------------------------- chrome */

export function AdminMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-[7px] bg-[var(--color-accent)]" aria-hidden>
        <svg viewBox="0 0 16 16" className="size-4" fill="none">
          <path d="M3 4h10M3 8h7M3 12h4" stroke="var(--color-accent-contrast)" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </span>
      <span className="font-[family-name:var(--font-display)] text-[0.9375rem] font-semibold tracking-tight text-[var(--color-text)]">
        Flow <span className="font-medium text-[var(--color-text-faint)]">· Admin</span>
      </span>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="space-y-0.5">
        <h2 className="text-[1.0625rem] text-[var(--color-text)]">{title}</h2>
        {description && <p className="max-w-3xl text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- stats */

/**
 * A grid of tiles separated by hairlines. The lines are the 1px gaps showing
 * the border colour through, so they stay correct at every column count.
 * `flat` drops the outer frame, for a grid that sits inside a panel.
 */
export function TileGrid({ className, flat, children }: { className?: string; flat?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden bg-[var(--color-border)] [&>*]:bg-[var(--color-surface)]',
        !flat && 'rounded-[var(--radius-panel)] border border-[var(--color-border)] shadow-[var(--shadow-panel)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A headline number with its change against the previous period. `inverse`
 * is for numbers where up is bad, such as errors.
 */
export function KpiTile({
  label,
  value,
  hint,
  current,
  previous,
  inverse,
}: {
  label: string;
  value: string;
  hint?: string;
  current?: number;
  previous?: number;
  inverse?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-4">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1.5 font-[family-name:var(--font-display)] text-[1.625rem] leading-none tabular-nums text-[var(--color-text)]">
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {current !== undefined && previous !== undefined && <Delta current={current} previous={previous} inverse={inverse} />}
        {hint && <span className="text-[0.6875rem] text-[var(--color-text-faint)]">{hint}</span>}
      </div>
    </div>
  );
}

export function Delta({ current, previous, inverse }: { current: number; previous: number; inverse?: boolean }) {
  if (!previous && !current) return <span className="text-[0.6875rem] text-[var(--color-text-faint)]">No change</span>;
  if (!previous) return <span className="text-[0.6875rem] font-medium text-[var(--color-signal)]">New</span>;

  const change = (current - previous) / previous;
  const rounded = Math.round(change * 100);
  if (rounded === 0) return <span className="text-[0.6875rem] text-[var(--color-text-faint)]">No change</span>;

  const up = change > 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[0.6875rem] font-medium tabular-nums',
        good ? 'text-[var(--color-signal)]' : 'text-[var(--color-rose)]',
      )}
      title="Compared with the previous period of the same length"
    >
      <Icon className="size-3" aria-hidden />
      {up ? '+' : ''}
      {rounded}%
    </span>
  );
}

/** A small labelled figure, for rows of secondary numbers. */
export function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[1.25rem] leading-none tabular-nums text-[var(--color-text)]">{value}</p>
      {hint && <p className="mt-1.5 text-[0.6875rem] leading-snug text-[var(--color-text-faint)]">{hint}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- lists */

/**
 * A ranked list with a proportional bar behind each row. The value is always
 * printed, so the bar only helps compare — it never carries the number alone.
 */
export function BarList({
  rows,
  empty = 'Nothing recorded in this period yet.',
}: {
  rows: { label: React.ReactNode; value: number; display?: string; aside?: string }[];
  empty?: string;
}) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-[0.8125rem] text-[var(--color-text-faint)]">{empty}</p>;

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-1 px-3 py-3">
      {rows.map((row, index) => (
        <li key={index} className="relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-chip)] px-2.5 py-1.5">
          <span
            className="absolute inset-y-0 left-0 rounded-[var(--radius-chip)] bg-[var(--color-accent-soft)]"
            style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            aria-hidden
          />
          <span className="relative min-w-0 flex-1 truncate text-[0.8125rem] text-[var(--color-text)]">{row.label}</span>
          {row.aside && <span className="relative shrink-0 text-[0.6875rem] text-[var(--color-text-faint)]">{row.aside}</span>}
          <span className="numeric relative w-14 shrink-0 text-right text-[var(--color-text)]">{row.display ?? compact(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The journey from first visit to a real draft. Each bar is the share of the
 * period's visitors; the note under it is what was lost since the step before.
 */
export function Funnel({ steps }: { steps: { label: string; hint: string; value: number }[] }) {
  const base = steps[0]?.value ?? 0;

  if (!base) return <p className="px-4 py-8 text-center text-[0.8125rem] text-[var(--color-text-faint)]">Nobody visited in this period yet.</p>;

  return (
    <ol className="space-y-3.5 px-5 py-4">
      {steps.map((step, index) => {
        const share = (step.value / base) * 100;
        const before = index > 0 ? steps[index - 1].value : null;
        const lost = before !== null && before > 0 ? Math.max(0, before - step.value) : 0;

        return (
          <li key={step.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">
                  <span className="mr-2 text-[var(--color-text-faint)] tabular-nums">{index + 1}</span>
                  {step.label}
                </p>
                <p className="text-[0.6875rem] text-[var(--color-text-faint)]">{step.hint}</p>
              </div>
              <p className="shrink-0 text-right">
                <span className="numeric text-[var(--color-text)]">{compact(step.value)}</span>
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">{percent(step.value, base)}</span>
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
              <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.max(step.value ? 1.5 : 0, share)}%` }} />
            </div>
            {before !== null && lost > 0 && (
              <p className="text-[0.6875rem] text-[var(--color-text-faint)]">
                {compact(lost)} fewer than the step before ({percent(lost, before)} drop)
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------- tables */

export function Table({
  columns,
  rows,
  empty = 'Nothing recorded in this period yet.',
}: {
  columns: { label: string; align?: 'right' }[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-[0.8125rem] text-[var(--color-text-faint)]">{empty}</p>;

  return (
    <div className="scroll-x">
      <table className="w-full min-w-[560px] border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]',
                  column.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[var(--color-border)] last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'px-4 py-2.5 text-[var(--color-text)]',
                    columns[cellIndex]?.align === 'right' ? 'numeric whitespace-nowrap text-right' : 'text-left',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
