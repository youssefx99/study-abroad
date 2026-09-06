'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Loader2, Copy, ChevronRight, KeyRound, Sparkles, RotateCcw } from 'lucide-react';
import { api, ApiError, subscribeToRun, CLOUD_MODE } from '@/lib/api';
import { getApiKey, setApiKey, looksLikeKey, subscribeToApiKey } from '@/lib/cloud/api-key';
import type { Run, RunItem, Pipeline } from '@/lib/types';
import { cn, copyToClipboard, countWords } from '@/lib/utils';

/**
 * The whole product, on one page.
 *
 * Four steps, in the order someone actually thinks about them: who you are,
 * who you are writing to, how to pay for it, go. Everything else — prompt
 * editing, pipelines, per-target fields, run history — still exists behind the
 * Advanced link, but it is no longer in the way of the one thing almost
 * everybody comes here to do.
 */

const DEGREES = [
  { value: 'phd', label: 'a PhD' },
  { value: 'masters', label: "a Master's" },
  { value: 'bachelors', label: "a Bachelor's" },
  { value: 'postdoc', label: 'a postdoc' },
  { value: 'research-internship', label: 'a research internship' },
  { value: 'exchange', label: 'an exchange semester' },
];

interface ParsedTarget {
  name: string;
  organization: string;
  url: string;
}

/** "Prof. Hartmann, RWTH Aachen, https://…" — comma-separated, any order. */
function parseTargets(text: string): ParsedTarget[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
      const url = parts.find((p) => /^https?:\/\//i.test(p)) ?? '';
      const rest = parts.filter((p) => p !== url);
      return { name: rest[0] ?? '', organization: rest.slice(1).join(', '), url };
    })
    .filter((t) => t.name);
}

export default function Home() {
  const [step, setStep] = React.useState(1);

  // Step 1
  const [name, setName] = React.useState('');
  const [about, setAbout] = React.useState('');
  const [degree, setDegree] = React.useState('phd');

  // Step 2
  const [targetText, setTargetText] = React.useState('');
  const targets = React.useMemo(() => parseTargets(targetText), [targetText]);

  // Step 3
  const [keyInput, setKeyInput] = React.useState('');
  const [hasKey, setHasKey] = React.useState(false);
  const [demo, setDemo] = React.useState(false);

  // Step 4
  const [research, setResearch] = React.useState(true);
  const [run, setRun] = React.useState<Run | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setHasKey(Boolean(getApiKey()));
    return subscribeToApiKey(() => setHasKey(Boolean(getApiKey())));
  }, []);

  const saveKey = () => {
    if (!looksLikeKey(keyInput)) return;
    setApiKey(keyInput.trim(), true);
    setKeyInput('');
    setStep(4);
  };

  const start = async () => {
    setBusy(true);
    setError('');

    try {
      const profile = await api.post<{ id: string }>('/api/profiles', {
        fullName: name.trim(),
        summary: about.trim(),
        researchStatement: about.trim(),
        targetDegree: degree,
      });

      const created = await Promise.all(
        targets.map((t) =>
          api.post<{ id: string }>('/api/targets', {
            name: t.name,
            organization: t.organization,
            links: t.url ? [{ id: `lnk_${Math.random().toString(36).slice(2, 9)}`, label: 'Link', url: t.url }] : [],
          }),
        ),
      );

      const pipelines = await api.get<Pipeline[]>('/api/pipelines');
      // "Research online" is the only knob, so it picks the pipeline rather
      // than making anyone learn what a pipeline is.
      const wanted = research ? 'Faculty outreach' : 'Quick draft';
      const pipeline = pipelines.find((p) => p.name.startsWith(wanted)) ?? pipelines[0];

      const started = await api.post<Run>('/api/runs', {
        profileId: profile.id,
        pipelineId: pipeline.id,
        targetIds: created.map((t) => t.id),
        options: { demoMode: demo || !hasKey, concurrency: 2 },
      });

      setRun(started);

      const unsubscribe = subscribeToRun(
        started.id,
        (message) => {
          const payload = message as { kind: string; run?: Run };
          if (payload.kind === 'snapshot' && payload.run) setRun(payload.run);
          if (payload.kind === 'done') {
            api.get<Run>(`/api/runs/${started.id}`).then(setRun).catch(() => undefined);
            setBusy(false);
          }
        },
        () => setBusy(false),
      );

      // Local mode streams from the server; poll as a backstop either way.
      const poll = setInterval(async () => {
        try {
          const latest = await api.get<Run>(`/api/runs/${started.id}`);
          setRun(latest);
          if (latest.status !== 'running' && latest.status !== 'queued') {
            clearInterval(poll);
            unsubscribe();
            setBusy(false);
          }
        } catch {
          /* keep polling */
        }
      }, 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const reset = () => {
    setRun(null);
    setStep(1);
    setTargetText('');
    setError('');
  };

  const canStart = name.trim() && targets.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:py-16">
      <header className="mb-10">
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--color-text)]">
          Email professors, without the copy-paste.
        </h1>
        <p className="mt-2 text-[0.9375rem] text-[var(--color-text-muted)]">
          Add your details and a list of people. Get a personal draft for each one.
        </p>
      </header>

      {run ? (
        <Results run={run} busy={busy} onReset={reset} />
      ) : (
        <div className="space-y-3">
          <Step n={1} title="About you" open={step === 1} done={step > 1} summary={name} onOpen={() => setStep(1)}>
            <div className="space-y-4">
              <Input label="Your name" value={name} onChange={setName} placeholder="Amara Okonkwo" autoFocus />

              <div className="space-y-1.5">
                <label className="text-[0.8125rem] font-medium text-[var(--color-text)]">I&rsquo;m applying for</label>
                <select
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  className="h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[0.9375rem] text-[var(--color-text)]"
                >
                  {DEGREES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.8125rem] font-medium text-[var(--color-text)]">About you</label>
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  rows={6}
                  placeholder="Your degree, what you've worked on, what you want to research. Or paste your CV."
                  className="w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-[0.9375rem] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]"
                />
                <p className="text-xs text-[var(--color-text-faint)]">More detail here means less generic emails.</p>
              </div>

              <Next onClick={() => setStep(2)} disabled={!name.trim()} />
            </div>
          </Step>

          <Step
            n={2}
            title="Who to email"
            open={step === 2}
            done={step > 2}
            summary={targets.length ? `${targets.length} ${targets.length === 1 ? 'person' : 'people'}` : ''}
            onOpen={() => setStep(2)}
          >
            <div className="space-y-4">
              <textarea
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                rows={7}
                autoFocus
                placeholder={'One per line:\n\nProf. Lena Hartmann, RWTH Aachen\nDr. Yuki Tanaka, Kyoto University\nMSc Water Science, IHE Delft, https://…'}
                className="w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5 font-[family-name:var(--font-mono)] text-[0.8125rem] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]"
              />
              {targets.length > 0 && (
                <p className="text-[0.8125rem] text-[var(--color-signal)]">
                  {targets.length} found
                </p>
              )}
              <Next onClick={() => setStep(3)} disabled={!targets.length} />
            </div>
          </Step>

          <Step
            n={3}
            title="Your OpenAI key"
            open={step === 3}
            done={step > 3}
            summary={hasKey ? 'Added' : demo ? 'Skipped' : ''}
            onOpen={() => setStep(3)}
          >
            <div className="space-y-4">
              {hasKey ? (
                <p className="text-[0.9375rem] text-[var(--color-signal)]">Your key is saved in this browser.</p>
              ) : (
                <>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                    placeholder="sk-..."
                    autoFocus
                    className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[0.9375rem] text-[var(--color-text)]"
                  />
                  <p className="text-xs leading-relaxed text-[var(--color-text-faint)]">
                    Stays in your browser.{' '}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline"
                    >
                      Get one
                    </a>
                    .
                  </p>
                </>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Next onClick={hasKey ? () => setStep(4) : saveKey} disabled={!hasKey && !looksLikeKey(keyInput)} />
                {!hasKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setDemo(true);
                      setStep(4);
                    }}
                    className="text-[0.8125rem] text-[var(--color-text-muted)] underline underline-offset-4 hover:text-[var(--color-text)]"
                  >
                    Skip and try it first
                  </button>
                )}
              </div>
            </div>
          </Step>

          <Step n={4} title="Write the emails" open={step === 4} done={false} summary="" onOpen={() => setStep(4)}>
            <div className="space-y-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={research}
                  onChange={(e) => setResearch(e.target.checked)}
                  className="mt-1 size-4 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="block text-[0.9375rem] text-[var(--color-text)]">Look each person up online first</span>
                  <span className="block text-xs text-[var(--color-text-faint)]">Better emails. A few minutes each.</span>
                </span>
              </label>

              {(demo || !hasKey) && (
                <p className="rounded-[var(--radius-control)] bg-[var(--color-amber-soft)] px-3 py-2.5 text-[0.8125rem] text-[var(--color-amber)]">
                  No key, so these will be sample drafts, not real ones.
                </p>
              )}

              {error && (
                <p className="rounded-[var(--radius-control)] bg-[var(--color-rose-soft)] px-3 py-2.5 text-[0.8125rem] text-[var(--color-rose)]">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={start}
                disabled={!canStart || busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-accent)] text-[0.9375rem] font-medium text-[var(--color-accent-contrast)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-45"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Write {targets.length} {targets.length === 1 ? 'email' : 'emails'}
              </button>
            </div>
          </Step>
        </div>
      )}

      <footer className="mt-14 flex items-center justify-between border-t border-[var(--color-border)] pt-5 text-xs text-[var(--color-text-faint)]">
        <span>{CLOUD_MODE ? 'Everything stays in your browser.' : 'Running on your machine.'}</span>
        <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
          Advanced
          <ChevronRight className="size-3" />
        </Link>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Step({
  n,
  title,
  open,
  done,
  summary,
  onOpen,
  children,
}: {
  n: number;
  title: string;
  open: boolean;
  done: boolean;
  summary: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-[var(--radius-panel)] border transition-colors',
        open ? 'border-[var(--color-accent)] bg-[var(--color-surface)]' : 'border-[var(--color-border)] bg-transparent',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:cursor-default"
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-medium',
            done
              ? 'bg-[var(--color-signal)] text-white'
              : open
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                : 'border border-[var(--color-border-strong)] text-[var(--color-text-faint)]',
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </span>

        <span className={cn('flex-1 text-[0.9375rem]', open ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-muted)]')}>
          {title}
        </span>

        {!open && summary && <span className="text-[0.8125rem] text-[var(--color-text-faint)]">{summary}</span>}
      </button>

      {open && <div className="px-4 pb-5 pl-14">{children}</div>}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[0.8125rem] font-medium text-[var(--color-text)]">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[0.9375rem] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]"
      />
    </div>
  );
}

function Next({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-10 rounded-[var(--radius-control)] bg-[var(--color-accent)] px-5 text-[0.875rem] font-medium text-[var(--color-accent-contrast)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
    >
      Continue
    </button>
  );
}

/* ----------------------------------------------------------------- results */

function Results({ run, busy, onReset }: { run: Run; busy: boolean; onReset: () => void }) {
  const done = run.items.filter((i) => i.status === 'succeeded').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.9375rem] text-[var(--color-text)]">
          {busy || run.status === 'running' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-[var(--color-accent)]" />
              Writing… {done} of {run.items.length} done
            </span>
          ) : (
            `${done} of ${run.items.length} ready`
          )}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <RotateCcw className="size-3.5" />
          Start over
        </button>
      </div>

      {run.items.map((item) => (
        <EmailCard key={item.targetId} item={item} />
      ))}
    </div>
  );
}

function EmailCard({ item }: { item: RunItem }) {
  const [copied, setCopied] = React.useState(false);

  // The last step that produced a subject and body is the finished draft.
  const draft = [...item.steps]
    .reverse()
    .map((s) => s.output as { subject?: string; body?: string } | null)
    .find((o) => o && typeof o.subject === 'string' && typeof o.body === 'string');

  const copy = async () => {
    if (!draft) return;
    await copyToClipboard(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <span className="min-w-0 truncate text-[0.9375rem] font-medium text-[var(--color-text)]">{item.targetName}</span>

        {item.status === 'running' && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--color-amber)]" />}
        {item.status === 'pending' && <span className="shrink-0 text-xs text-[var(--color-text-faint)]">waiting</span>}
        {item.status === 'failed' && <span className="shrink-0 text-xs text-[var(--color-rose)]">failed</span>}

        {draft && (
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-sunken)]"
          >
            {copied ? <Check className="size-3.5 text-[var(--color-signal)]" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {item.error && <p className="px-4 py-3 text-[0.8125rem] text-[var(--color-rose)]">{item.error}</p>}

      {draft && (
        <div className="space-y-3 px-4 py-4">
          <p className="text-[0.9375rem] font-medium text-[var(--color-text)]">{draft.subject}</p>
          <p className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-[var(--color-text)]">{draft.body}</p>
          <p className="text-xs text-[var(--color-text-faint)]">{countWords(draft.body ?? '')} words · read it before sending</p>
        </div>
      )}
    </article>
  );
}
