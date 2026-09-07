'use client';

import * as React from 'react';
import { Upload, FileText, Sparkles, Check, AlertTriangle } from 'lucide-react';
import { extractText, parseCv, mergeCvIntoProfile, summariseFields, CvImportError, type CvFields } from '@/lib/cv-import';
import type { Profile } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Dialog, DialogContent, DialogBody, DialogFooter, DialogClose, Notice, Badge } from '@/components/ui/primitives';

/**
 * Read a CV, fill the profile.
 *
 * Three states rather than a wizard: choose a file, wait, confirm what was
 * found. The confirmation matters — it is the difference between "the form
 * filled itself" and "something changed and I do not know what", and it is
 * where someone notices the model missed their second degree.
 */

type Phase = 'choose' | 'working' | 'done' | 'error';

export function CvImportDialog({
  open,
  onOpenChange,
  profile,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  onApply: (profile: Profile) => void;
}) {
  const [phase, setPhase] = React.useState<Phase>('choose');
  const [status, setStatus] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [pasted, setPasted] = React.useState('');
  const [fields, setFields] = React.useState<CvFields | null>(null);
  const [text, setText] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) return;
    // Reset on close so reopening does not show the previous result.
    setPhase('choose');
    setStatus('');
    setMessage('');
    setPasted('');
    setFields(null);
    setText('');
  }, [open]);

  const run = async (getText: () => Promise<string>, firstStatus: string) => {
    setPhase('working');
    setMessage('');

    try {
      setStatus(firstStatus);
      const extracted = await getText();
      setText(extracted);

      setStatus('Reading it…');
      const parsed = await parseCv(extracted);

      setFields(parsed);
      setPhase('done');
    } catch (error) {
      setMessage(error instanceof CvImportError || error instanceof Error ? error.message : 'That did not work.');
      setPhase('error');
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    run(() => extractText(file), `Opening ${file.name}…`);
  };

  const apply = () => {
    if (!fields) return;
    onApply(mergeCvIntoProfile(profile, fields, text));
    onOpenChange(false);
  };

  const found = fields ? summariseFields(fields).filter((row) => row.count > 0) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title="Start from your CV"
        description="Upload it and the fields fill themselves. You can change anything afterwards."
      >
        <DialogBody className="space-y-4">
          {phase === 'choose' && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  onFile(event.dataTransfer.files?.[0]);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-strong)] px-6 py-12 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-sunken)]"
              >
                <Upload className="size-6 text-[var(--color-text-faint)]" />
                <span className="text-[0.9375rem] font-medium text-[var(--color-text)]">Choose a file, or drop it here</span>
                <span className="text-[0.8125rem] text-[var(--color-text-faint)]">PDF, DOCX, or plain text</span>
              </button>

              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(event) => onFile(event.target.files?.[0])}
              />

              <details className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2.5">
                <summary className="cursor-pointer text-[0.8125rem] text-[var(--color-text-muted)]">
                  Paste the text instead
                </summary>
                <div className="mt-3 space-y-3">
                  <Textarea
                    rows={9}
                    value={pasted}
                    onChange={(event) => setPasted(event.target.value)}
                    placeholder="Paste your CV here."
                    className="font-[family-name:var(--font-mono)] text-xs"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => run(async () => pasted.trim(), 'Reading it…')}
                    disabled={pasted.trim().length < 120}
                  >
                    <Sparkles />
                    Read this
                  </Button>
                </div>
              </details>

              <p className="text-xs leading-relaxed text-[var(--color-text-faint)]">
                The file is read in your browser. Only the text is sent, on the same request that carries your own key.
              </p>
            </>
          )}

          {phase === 'working' && (
            <div className="flex flex-col items-center gap-3 py-14">
              <Sparkles className="size-6 animate-working text-[var(--color-accent)]" />
              <p className="text-[0.9375rem] text-[var(--color-text)]">{status}</p>
              <p className="text-[0.8125rem] text-[var(--color-text-faint)]">This takes a few seconds.</p>
            </div>
          )}

          {phase === 'error' && (
            <>
              <Notice tone="negative" icon={<AlertTriangle />} title="That did not work">
                {message}
              </Notice>
              <Button variant="secondary" onClick={() => setPhase('choose')}>
                Try again
              </Button>
            </>
          )}

          {phase === 'done' && fields && (
            <>
              <Notice tone="positive" icon={<Check />} title="Read it">
                Check it over below. Nothing you have already filled in was replaced.
              </Notice>

              <div className="flex flex-wrap gap-1.5">
                {found.length ? (
                  found.map((row) => (
                    <Badge key={row.label} tone="neutral">
                      {row.count} {row.label.toLowerCase()}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[0.8125rem] text-[var(--color-text-faint)]">Nothing structured came out of it.</span>
                )}
              </div>

              <dl className="divide-y divide-[var(--color-border)] rounded-[var(--radius-control)] border border-[var(--color-border)]">
                <Row label="Name" value={fields.fullName} />
                <Row label="Headline" value={fields.headline} />
                <Row label="Based in" value={[fields.city, fields.countryOfResidence].filter(Boolean).join(', ')} />
                <Row label="Email" value={fields.email} />
                {fields.education?.[0] && (
                  <Row
                    label="Latest degree"
                    value={[fields.education[0].degree, fields.education[0].field, fields.education[0].institution]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                )}
                {fields.experience?.[0] && (
                  <Row
                    label="Latest role"
                    value={[fields.experience[0].role, fields.experience[0].organization].filter(Boolean).join(' · ')}
                  />
                )}
              </dl>

              <details className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2.5">
                <summary className="cursor-pointer text-[0.8125rem] text-[var(--color-text-muted)]">
                  Everything it found
                </summary>
                <pre className="scroll-x mt-3 max-h-72 overflow-y-auto rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] p-3 font-[family-name:var(--font-mono)] text-[0.6875rem] leading-relaxed">
                  {JSON.stringify(fields, null, 2)}
                </pre>
              </details>

              <p className="text-xs text-[var(--color-text-faint)]">
                {formatNumber(text.length)} characters of CV text kept, so drafts can quote it.
              </p>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{phase === 'done' ? 'Cancel' : 'Close'}</Button>
          </DialogClose>
          {phase === 'done' && (
            <Button variant="primary" onClick={apply}>
              <Check />
              Fill in my profile
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-[0.8125rem] text-[var(--color-text-muted)]">{label}</dt>
      <dd className={cn('min-w-0 text-right text-[0.8125rem]', value ? 'text-[var(--color-text)]' : 'text-[var(--color-text-faint)]')}>
        {value || 'not found'}
      </dd>
    </div>
  );
}

/** The empty-profile prompt that makes this the first step rather than a menu item. */
export function CvImportPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--radius-panel)] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-5 py-4">
      <FileText className="size-5 shrink-0 text-[var(--color-accent)]" />
      <div className="min-w-[14rem] flex-1">
        <p className="text-[0.9375rem] font-medium text-[var(--color-text)]">Start from your CV</p>
        <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
          Upload it once and the sections below fill themselves.
        </p>
      </div>
      <Button variant="primary" onClick={onOpen}>
        <Upload />
        Upload CV
      </Button>
    </div>
  );
}
