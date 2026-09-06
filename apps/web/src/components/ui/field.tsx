'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Form primitives.
 *
 * Every input is wrapped by `Field`, which owns the label, the hint, and the
 * error. Putting them in one place is what keeps `aria-describedby` and
 * `aria-invalid` correct across forty forms without anyone remembering to add
 * them.
 */

const controlClasses =
  'w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] transition-colors duration-[120ms] placeholder:text-[var(--color-text-faint)] hover:border-[var(--color-text-faint)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-[var(--color-rose)]';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Right-aligned slot for a counter, a unit, or a small action. */
  aside?: React.ReactNode;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode;
}

export function Field({ label, hint, error, required, aside, className, children }: FieldProps) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={id} className="text-[0.8125rem] font-medium text-[var(--color-text)]">
              {label}
              {required && (
                <span className="ml-1 text-[var(--color-rose)]" aria-label="required">
                  *
                </span>
              )}
            </label>
          )}
          {aside && <div className="text-xs text-[var(--color-text-faint)]">{aside}</div>}
        </div>
      )}

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error ? (
        <p id={errorId} className="text-xs text-[var(--color-rose)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-[var(--color-text-faint)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlClasses, 'h-9', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(controlClasses, 'py-2 leading-relaxed resize-y', className)} {...props} />;
  },
);

/**
 * A native select, styled.
 *
 * Deliberately not a Radix listbox: native selects get the platform picker on
 * mobile, work without JavaScript, and handle right-to-left and IME input for
 * free. For a product used on whatever device a student has, that matters more
 * than a custom caret.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(controlClasses, 'h-9 appearance-none pr-9 cursor-pointer', className)}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-faint)]"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  },
);

/**
 * Text input backed by a datalist.
 *
 * Used wherever the platform must not constrain the answer — grading scales,
 * test names, languages. Suggestions help the common case without blocking a
 * system nobody on the team has heard of.
 */
export function ComboInput({
  options,
  listId,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { options: string[]; listId: string }) {
  return (
    <>
      <input list={listId} className={cn(controlClasses, 'h-9', className)} {...props} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] accent-[var(--color-accent)]',
        className,
      )}
      {...props}
    />
  );
}
