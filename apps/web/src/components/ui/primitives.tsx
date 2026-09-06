'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ panels */

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('surface', className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4', className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{title}</h2>
        {description && <p className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- tabs */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('scroll-x flex items-center gap-1 border-b border-[var(--color-border)]', className)}
      {...props}
    />
  );
}

/**
 * Tabs read as tabs: a moving underline on the active one, not a pill.
 * The underline sits on the same line that separates the tab strip from the
 * content, which is what makes the panel feel attached to its tab.
 */
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[0.8125rem] font-medium text-[var(--color-text-muted)] transition-colors duration-[120ms]',
        'hover:text-[var(--color-text)]',
        'data-[state=active]:border-[var(--color-accent)] data-[state=active]:text-[var(--color-text)]',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('focus-visible:outline-none', className)} {...props} />;
}

/* ------------------------------------------------------------------ badges */

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'negative' | 'muted' | 'progress';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-transparent',
  positive: 'bg-[var(--color-signal-soft)] text-[var(--color-signal)] border-transparent',
  warning: 'bg-[var(--color-amber-soft)] text-[var(--color-amber)] border-transparent',
  negative: 'bg-[var(--color-rose-soft)] text-[var(--color-rose)] border-transparent',
  muted: 'bg-transparent text-[var(--color-text-faint)] border-[var(--color-border)]',
  progress: 'bg-[var(--color-amber-soft)] text-[var(--color-amber)] border-transparent',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-chip)] border px-1.5 py-0.5 text-[0.6875rem] font-medium leading-tight',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- dialogs */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  wide,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(16_23_36/0.4)] backdrop-blur-[2px] data-[state=open]:animate-row-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-modal)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-modal)]',
          wide ? 'max-w-3xl' : 'max-w-lg',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div className="space-y-1">
            <DialogPrimitive.Title className="text-base font-semibold text-[var(--color-text)]">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-[var(--radius-control)] p-1 text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text)]"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3.5', className)}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- switch */

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-[120ms]',
        'bg-[var(--color-border-strong)] data-[state=checked]:bg-[var(--color-accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-[120ms] data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = React.useId();

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <label htmlFor={id} className="cursor-pointer text-[0.8125rem] font-medium text-[var(--color-text)]">
          {label}
        </label>
        {hint && <p className="text-xs leading-relaxed text-[var(--color-text-faint)]">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

/* ---------------------------------------------------------------- tooltip */

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-[var(--radius-control)] bg-[var(--color-ink)] px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-[var(--shadow-raised)] dark:bg-[var(--color-surface-raised)] dark:text-[var(--color-text)]"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* -------------------------------------------------------------- feedback */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-3 text-[var(--color-text-faint)]">{icon}</div>}
      <h3 className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-working rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)]', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('size-4 animate-spin text-[var(--color-text-faint)]', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** A thin, quiet progress bar. Used for completeness and run progress. */
export function Progress({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'positive' | 'warning'; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const colour =
    tone === 'positive' ? 'var(--color-signal)' : tone === 'warning' ? 'var(--color-amber)' : 'var(--color-accent)';

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunken)]', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: colour }}
      />
    </div>
  );
}

/** Inline notice. `tone` maps to the same semantics as badges. */
export function Notice({
  tone = 'neutral',
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: 'neutral' | 'accent' | 'warning' | 'negative' | 'positive';
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]',
    accent: 'border-transparent bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
    positive: 'border-transparent bg-[var(--color-signal-soft)] text-[var(--color-signal)]',
    warning: 'border-transparent bg-[var(--color-amber-soft)] text-[var(--color-amber)]',
    negative: 'border-transparent bg-[var(--color-rose-soft)] text-[var(--color-rose)]',
  };

  return (
    <div className={cn('flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-2.5 text-[0.8125rem]', tones[tone], className)}>
      {icon && <span className="mt-px shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
