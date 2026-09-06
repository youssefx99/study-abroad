'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toasts.
 *
 * Hand-rolled rather than pulled in as a dependency: the requirement is four
 * lines of state and a timer, and every action in this product needs to confirm
 * itself, so this is load-bearing enough to want direct control over.
 */

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="size-4 text-[var(--color-signal)]" />,
  error: <AlertCircle className="size-4 text-[var(--color-rose)]" />,
  info: <Info className="size-4 text-[var(--color-accent)]" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current, { ...input, id }]);

      // Errors stay longer: they usually contain something to act on.
      const lifetime = input.tone === 'error' ? 7000 : 4000;
      setTimeout(() => dismiss(id), lifetime);
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto animate-row-in flex items-start gap-2.5 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-3 shadow-[var(--shadow-raised)]',
            )}
          >
            <span className="mt-px shrink-0">{ICONS[item.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 break-words text-xs leading-relaxed text-[var(--color-text-muted)]">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="shrink-0 rounded p-0.5 text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text)]"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
