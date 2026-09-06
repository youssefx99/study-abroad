'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Copy, Download, Plus, Trash2 } from 'lucide-react';
import { cn, copyToClipboard, downloadFile, humanizeKey, localId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Panel, Spinner, Notice } from '@/components/ui/primitives';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import type { StepStatus, RunStatus } from '@/lib/types';

/* ------------------------------------------------------------ page chrome */

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  breadcrumb,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: { href: string; label: string }[];
}) {
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-5 pt-6 lg:px-6">
      <div className="mx-auto max-w-[1400px]">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="mb-2 flex items-center gap-1 text-xs text-[var(--color-text-faint)]">
            {breadcrumb.map((crumb, index) => (
              <React.Fragment key={crumb.href}>
                {index > 0 && <ChevronRight className="size-3" />}
                <Link href={crumb.href} className="transition-colors hover:text-[var(--color-text)]">
                  {crumb.label}
                </Link>
              </React.Fragment>
            ))}
          </nav>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            {eyebrow && <p className="text-xs font-medium text-[var(--color-accent)]">{eyebrow}</p>}
            <h1 className="text-[1.375rem] leading-tight text-[var(--color-text)]">{title}</h1>
            {description && <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto max-w-[1400px] px-4 py-6 lg:px-6', className)}>{children}</div>;
}

/* ------------------------------------------------------------------ status */

const STEP_TONES: Record<StepStatus, { label: string; tone: 'neutral' | 'progress' | 'positive' | 'negative' | 'muted' }> = {
  pending: { label: 'Waiting', tone: 'neutral' },
  running: { label: 'Working', tone: 'progress' },
  succeeded: { label: 'Done', tone: 'positive' },
  failed: { label: 'Failed', tone: 'negative' },
  skipped: { label: 'Skipped', tone: 'muted' },
};

const RUN_TONES: Record<RunStatus, { label: string; tone: 'neutral' | 'progress' | 'positive' | 'negative' | 'warning' | 'muted' }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'progress' },
  completed: { label: 'Completed', tone: 'positive' },
  partial: { label: 'Partly done', tone: 'warning' },
  failed: { label: 'Failed', tone: 'negative' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const { label, tone } = STEP_TONES[status];
  return (
    <Badge tone={tone}>
      {status === 'running' && <span className="size-1.5 animate-working rounded-full bg-current" />}
      {label}
    </Badge>
  );
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, tone } = RUN_TONES[status];
  return (
    <Badge tone={tone}>
      {status === 'running' && <span className="size-1.5 animate-working rounded-full bg-current" />}
      {label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ ledger */

/**
 * The ledger: one surface, rows separated by hairlines.
 *
 * Chosen over a grid of cards because these are records in a list, and a card
 * per record makes forty targets look like forty unrelated things.
 */
export function Ledger({ className, children }: { className?: string; children: React.ReactNode }) {
  return <Panel className={cn('overflow-hidden', className)}>{children}</Panel>;
}

export function LedgerRow({
  className,
  children,
  as = 'div',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'label' }) {
  const Comp = as as 'div';
  return (
    <Comp
      className={cn(
        'flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0 transition-colors duration-[120ms]',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

/* ------------------------------------------------------------------- stats */

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'accent' | 'warning' | 'negative';
}) {
  const colour =
    tone === 'accent'
      ? 'text-[var(--color-accent)]'
      : tone === 'warning'
        ? 'text-[var(--color-amber)]'
        : tone === 'negative'
          ? 'text-[var(--color-rose)]'
          : 'text-[var(--color-text)]';

  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className={cn('mt-1 font-[family-name:var(--font-display)] text-[1.5rem] leading-none tabular-nums', colour)}>{value}</p>
      {hint && <p className="mt-1.5 text-[0.6875rem] text-[var(--color-text-faint)]">{hint}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- actions */

export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
  variant = 'ghost',
  className,
}: {
  value: string;
  label?: string;
  size?: 'sm' | 'md' | 'iconSm';
  variant?: 'ghost' | 'secondary';
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const toast = useToast();

  const handle = async () => {
    const success = await copyToClipboard(value);
    if (!success) {
      toast.error('Could not copy', 'Your browser blocked clipboard access. Select the text and copy it manually.');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Button variant={variant} size={size} onClick={handle} className={className} aria-label={label}>
      {copied ? <Check className="text-[var(--color-signal)]" /> : <Copy />}
      {size !== 'iconSm' && (copied ? 'Copied' : label)}
    </Button>
  );
}

export function DownloadButton({ filename, content, label = 'Download' }: { filename: string; content: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => downloadFile(filename, content)}>
      <Download />
      {label}
    </Button>
  );
}

/* -------------------------------------------------------------- list editor */

/**
 * Editor for a list of free-text values — research interests, skills, tags.
 *
 * Chips with an add field rather than a comma-separated input, because a
 * comma-separated input silently mangles anything containing a comma, and
 * institution names frequently do.
 */
export function ChipListEditor({
  values,
  onChange,
  placeholder,
  suggestions,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  /** Threaded from the wrapping Field so the input has an accessible name. */
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const [draft, setDraft] = React.useState('');
  const listId = React.useId();

  const add = (value: string) => {
    const cleaned = value.trim();
    if (!cleaned || values.includes(cleaned)) {
      setDraft('');
      return;
    }
    onChange([...values, cleaned]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] py-0.5 pl-2 pr-1 text-xs text-[var(--color-text)]"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="rounded p-0.5 text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-rose)]"
                aria-label={`Remove ${value}`}
              >
                <svg viewBox="0 0 12 12" className="size-3" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          id={id}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          value={draft}
          list={suggestions ? listId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add(draft);
            }
            if (event.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="secondary" size="md" onClick={() => add(draft)} disabled={!draft.trim()}>
          <Plus />
          Add
        </Button>
      </div>

      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/**
 * Editor for a repeating group of records — education entries, test scores.
 * Owns adding, removing, and the empty state so every section behaves the same.
 */
export function RepeaterSection<T extends { id: string }>({
  title,
  description,
  items,
  onChange,
  makeEmpty,
  addLabel,
  emptyHint,
  renderItem,
}: {
  title: string;
  description?: string;
  items: T[];
  onChange: (items: T[]) => void;
  makeEmpty: () => T;
  addLabel: string;
  emptyHint: string;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
}) {
  const update = (id: string, patch: Partial<T>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{title}</h3>
          {description && <p className="text-[0.8125rem] text-[var(--color-text-muted)]">{description}</p>}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...items, makeEmpty()])}>
          <Plus />
          {addLabel}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-border-strong)] px-4 py-6 text-center text-[0.8125rem] text-[var(--color-text-faint)]">
          {emptyHint}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id} className="relative rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
              <Button
                type="button"
                variant="dangerGhost"
                size="iconSm"
                className="absolute right-2.5 top-2.5"
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                aria-label={`Remove entry ${index + 1}`}
              >
                <Trash2 />
              </Button>
              <div className="pr-9">{renderItem(item, (patch) => update(item.id, patch), index)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Key/value pairs the applicant defines themselves. */
export function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: { id: string; label: string; value: string }[];
  onChange: (fields: { id: string; label: string; value: string }[]) => void;
}) {
  return (
    <RepeaterSection
      title="Anything else"
      description="Add your own fields for details this form does not cover. Prompts can read them."
      items={fields}
      onChange={onChange}
      makeEmpty={() => ({ id: localId('cfd'), label: '', value: '' })}
      addLabel="Add field"
      emptyHint="Nothing extra yet. Use this for national exam names, sponsor references, or anything specific to your situation."
      renderItem={(item, update) => (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Label" />
          <Input value={item.value} onChange={(e) => update({ value: e.target.value })} placeholder="Value" />
        </div>
      )}
    />
  );
}

/* ------------------------------------------------------------ output views */

/**
 * Renders a step's structured output.
 *
 * Output schemas are user-defined, so this cannot ship a layout per field. It
 * derives one from the shape instead: prose for long strings, chips for string
 * lists, sub-sections for objects. That is what lets someone add a field to a
 * prompt schema and immediately see it rendered properly.
 */
export function StructuredOutput({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <p className="text-[0.8125rem] text-[var(--color-text-faint)]">Nothing returned.</p>;
  }

  if (typeof value === 'string') {
    return <p className="prose-body whitespace-pre-wrap text-[0.875rem] text-[var(--color-text)]">{value}</p>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <p className="numeric text-[var(--color-text)]">{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-[0.8125rem] text-[var(--color-text-faint)]">None.</p>;
    }

    const allShortStrings = value.every((v) => typeof v === 'string' && v.length < 90);
    if (allShortStrings) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(value as string[]).map((entry, index) => (
            <Badge key={`${entry}-${index}`} tone="neutral" className="max-w-full">
              <span className="truncate">{entry}</span>
            </Badge>
          ))}
        </div>
      );
    }

    if (value.every((v) => typeof v === 'string')) {
      return (
        <ul className="space-y-1.5">
          {(value as string[]).map((entry, index) => (
            <li key={index} className="flex gap-2 text-[0.875rem] leading-relaxed text-[var(--color-text)]">
              <span className="mt-[0.4rem] size-1 shrink-0 rounded-full bg-[var(--color-text-faint)]" />
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-3">
        {value.map((entry, index) => (
          <div key={index} className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3.5">
            <StructuredOutput value={entry} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) {
    return <p className="text-[0.8125rem] text-[var(--color-text-faint)]">Empty.</p>;
  }

  return (
    <dl className={cn('space-y-4', depth > 0 && 'space-y-3')}>
      {entries.map(([key, entry]) => (
        <div key={key} className="space-y-1.5">
          <dt className="text-[0.6875rem] font-medium text-[var(--color-text-faint)]">{humanizeKey(key)}</dt>
          <dd>
            <StructuredOutput value={entry} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Monospaced JSON with copy and download. */
export function JsonBlock({ value, filename }: { value: unknown; filename?: string }) {
  const text = React.useMemo(() => JSON.stringify(value, null, 2), [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <CopyButton value={text} label="Copy JSON" />
        {filename && <DownloadButton filename={filename} content={text} />}
      </div>
      <pre className="scroll-x max-h-[520px] overflow-y-auto rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3.5 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--color-text)]">
        {text}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------- async */

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 px-6 py-14 text-[0.8125rem] text-[var(--color-text-muted)]">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Notice
      tone="negative"
      title="Something went wrong"
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {error.message}
    </Notice>
  );
}
