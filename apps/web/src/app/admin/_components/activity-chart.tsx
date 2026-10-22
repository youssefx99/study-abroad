'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Activity over time: one measure at a time, picked with the tabs above it.
 *
 * One measure per chart on purpose — users, tokens, and runs live on wildly
 * different scales, and two y-axes on one chart is how numbers get misread.
 */

interface Point {
  bucket: string;
  users: number;
  visits: number;
  tokens: number;
  cost: number;
  runs: number;
}

const METRICS = [
  { key: 'users', label: 'Users', summary: 'peak', describe: 'Unique users active in each period' },
  { key: 'visits', label: 'Visits', summary: 'total', describe: 'Visits started in each period' },
  { key: 'tokens', label: 'Tokens', summary: 'total', describe: 'Tokens spent on model calls' },
  { key: 'cost', label: 'Est. cost', summary: 'total', describe: "Estimated spend on visitors' own OpenAI keys" },
  { key: 'runs', label: 'Runs', summary: 'total', describe: 'Pipeline runs started' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function format(metric: MetricKey, value: number): string {
  if (metric === 'cost') return value && value < 0.01 ? '<$0.01' : `$${value.toFixed(2)}`;
  return value < 10_000 ? Math.round(value).toLocaleString('en-US') : compactFormat.format(value);
}

/** Rounds the top of the scale up to a clean number, so the axis reads 0 / 50 / 100 rather than 0 / 43 / 87. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** UTC throughout, so the server and the browser agree on every label. */
function bucketLabel(bucket: string, unit: 'hour' | 'day'): string {
  const date = new Date(bucket);
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (unit === 'day') return day;
  const hour = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${hour}, ${day}`;
}

export function ActivityChart({ series, unit }: { series: Point[]; unit: 'hour' | 'day' }) {
  const [metric, setMetric] = React.useState<MetricKey>('users');
  const [hover, setHover] = React.useState<number | null>(null);

  const definition = METRICS.find((m) => m.key === metric)!;
  const values = series.map((point) => point[metric]);
  const peak = Math.max(0, ...values);
  const top = niceMax(peak);
  const summary = definition.summary === 'peak' ? peak : values.reduce((sum, v) => sum + v, 0);
  const dense = series.length > 45;
  const hovered = hover === null ? null : series[hover];

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="tablist" aria-label="Measure" className="flex flex-wrap gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                'rounded-[var(--radius-control)] px-2.5 py-1 text-[0.8125rem] transition-colors duration-[120ms]',
                metric === m.key
                  ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text)]',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-right text-xs text-[var(--color-text-muted)]">
          {definition.describe} ·{' '}
          <span className="font-medium text-[var(--color-text)]">
            {definition.summary === 'peak' ? 'peak' : 'total'} {format(metric, summary)}
          </span>
        </p>
      </div>

      <div className="flex gap-2">
        {/* Y axis: three clean ticks, recessive. */}
        <div className="numeric flex h-48 w-10 shrink-0 flex-col justify-between text-right text-[0.6875rem] text-[var(--color-text-faint)]">
          <span className="-mt-1.5">{format(metric, top)}</span>
          <span>{format(metric, top / 2)}</span>
          <span className="-mb-1.5">0</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden>
            <div className="absolute inset-x-0 top-0 border-t border-[var(--color-border)]" />
            <div className="absolute inset-x-0 top-1/2 border-t border-[var(--color-border)]" />
            <div className="absolute inset-x-0 bottom-0 border-t border-[var(--color-border-strong)]" />
          </div>

          <div
            className={cn('relative flex h-48 items-end', dense ? 'gap-px' : 'gap-[2px]')}
            onPointerLeave={() => setHover(null)}
            aria-hidden
          >
            {series.map((point, index) => {
              const value = point[metric];
              return (
                <div
                  key={point.bucket}
                  className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center"
                  onPointerEnter={() => setHover(index)}
                  onPointerDown={() => setHover(index)}
                >
                  <div
                    className={cn(
                      'w-full max-w-[24px] rounded-t-[4px] transition-colors duration-[120ms]',
                      hover === index ? 'bg-[var(--color-accent-hover)]' : 'bg-[var(--color-accent)]',
                      hover !== null && hover !== index && 'opacity-60',
                    )}
                    style={{ height: value > 0 ? `max(2px, ${(value / top) * 100}%)` : 0 }}
                  />
                </div>
              );
            })}
          </div>

          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-raised)]"
              style={{ left: `clamp(48px, ${((hover + 0.5) / series.length) * 100}%, calc(100% - 48px))` }}
            >
              <p className="text-[var(--color-text-muted)]">{bucketLabel(hovered.bucket, unit)}</p>
              <p className="font-medium tabular-nums text-[var(--color-text)]">
                {format(metric, hovered[metric])} {definition.label.toLowerCase()}
              </p>
            </div>
          )}

          <div className="mt-2 flex justify-between text-[0.6875rem] text-[var(--color-text-faint)]">
            <span>{series[0] ? bucketLabel(series[0].bucket, unit) : ''}</span>
            <span className="hidden sm:inline">
              {series.length > 2 ? bucketLabel(series[Math.floor(series.length / 2)].bucket, unit) : ''}
            </span>
            <span>{series.length > 1 ? bucketLabel(series[series.length - 1].bucket, unit) : ''}</span>
          </div>
        </div>
      </div>

      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>{definition.describe}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{definition.label}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.bucket}>
              <td>{bucketLabel(point.bucket, unit)}</td>
              <td>{format(metric, point[metric])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
