'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Target as TargetIcon, Plus, Search, Upload, Trash2, PlayCircle, X, ExternalLink, Pencil } from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { Target, TargetFacets, Meta } from '@/lib/types';
import { cn, timeAgo, truncate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select, Checkbox } from '@/components/ui/field';
import {
  Panel,
  EmptyState,
  Badge,
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
  DialogClose,
  Notice,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tooltip,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock, ChipListEditor } from '@/components/shared';

/**
 * Targets.
 *
 * A ledger, not a card grid: these are records in a list, and forty of them
 * need to be scannable, filterable, and selectable in bulk. Selection drives
 * the run wizard, so choosing who to write to happens here rather than in a
 * separate picker.
 */
export default function TargetsPage() {
  const toast = useToast();
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<Target | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  if (status) query.set('status', status);

  const key = `/api/targets${query.toString() ? `?${query}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<{ data: Target[]; meta: { facets: TargetFacets; total: number } }>(
    key,
    (path: string) => api.getWithMeta<Target[]>(path) as Promise<{ data: Target[]; meta: { facets: TargetFacets; total: number } }>,
  );
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);

  const targets = data?.data ?? [];
  const facets = data?.meta?.facets;
  const hasFilters = Boolean(search || status);

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const allVisibleSelected = targets.length > 0 && targets.every((t) => selected.includes(t.id));

  const bulkStatus = async (next: string) => {
    try {
      await api.post('/api/targets/bulk', { ids: selected, patch: { status: next } });
      await mutate();
      toast.success('Updated', `${selected.length} target${selected.length === 1 ? '' : 's'} set to ${next}.`);
      setSelected([]);
    } catch (err) {
      toast.error('Could not update', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const bulkDelete = async () => {
    try {
      const result = await api.post<{ deleted: number }>('/api/targets/bulk-delete', { ids: selected });
      await mutate();
      toast.success('Deleted', `${result.deleted} target${result.deleted === 1 ? '' : 's'} removed.`);
      setSelected([]);
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  return (
    <>
      <PageHeader
        title="Targets"
        description="Professors, degree programmes, scholarships, labs, or companies. Anything you would write to."
        action={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload />
              Import
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus />
              Add target
            </Button>
          </>
        }
      />

      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[15rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search names and universities"
              aria-label="Search targets"
              className="pl-9"
            />
          </div>

          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[8.5rem]" aria-label="Filter by status">
            <option value="">All statuses</option>
            {(facets?.statuses ?? []).map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus('');
              }}
            >
              <X />
              Clear
            </Button>
          )}
        </div>

        {selected.length > 0 && (
          <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-4 py-2.5">
            <span className="text-[0.8125rem] font-medium text-[var(--color-accent)]">
              {selected.length} selected
            </span>
            <div className="flex-1" />
            <Button asChild size="sm" variant="primary">
              <Link href={`/runs/new?targets=${selected.join(',')}`}>
                <PlayCircle />
                Run these
              </Link>
            </Button>
            <Select
              value=""
              onChange={(e) => e.target.value && bulkStatus(e.target.value)}
              className="h-8 w-auto text-[0.8125rem]"
              aria-label="Set status"
            >
              <option value="">Set status…</option>
              {(meta?.targetStatuses ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="dangerGhost" onClick={bulkDelete}>
              <Trash2 />
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}

        {error ? (
          <ErrorBlock error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <Panel>
            <LoadingBlock label="Loading targets" />
          </Panel>
        ) : !targets.length ? (
          <Panel>
            <EmptyState
              icon={<TargetIcon className="size-7" />}
              title={hasFilters ? 'Nothing matches those filters' : 'No targets yet'}
              description={
                hasFilters
                  ? 'Try widening the search or clearing a filter.'
                  : 'Add them one at a time, or paste a list you already have as JSON or a spreadsheet export.'
              }
              action={
                hasFilters ? undefined : (
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => setAdding(true)}>
                      <Plus />
                      Add a target
                    </Button>
                    <Button variant="secondary" onClick={() => setImporting(true)}>
                      <Upload />
                      Import a list
                    </Button>
                  </div>
                )
              }
            />
          </Panel>
        ) : (
          <Panel className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-2">
              <Checkbox
                checked={allVisibleSelected}
                onChange={(event) => setSelected(event.target.checked ? targets.map((t) => t.id) : [])}
                aria-label="Select all"
              />
              <span className="text-[0.6875rem] font-medium text-[var(--color-text-faint)]">
                {targets.length} target{targets.length === 1 ? '' : 's'}
              </span>
            </div>

            <div>
              {targets.map((target) => (
                <div
                  key={target.id}
                  className={cn(
                    'flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3 transition-colors last:border-b-0',
                    selected.includes(target.id) ? 'bg-[var(--color-accent-soft)]' : 'hover:bg-[var(--color-surface-sunken)]',
                  )}
                >
                  <Checkbox
                    className="mt-1"
                    checked={selected.includes(target.id)}
                    onChange={() => toggle(target.id)}
                    aria-label={`Select ${target.name}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(target)}
                        className="text-left text-[0.875rem] font-medium text-[var(--color-text)] hover:text-[var(--color-accent)]"
                      >
                        {target.name}
                      </button>
                      <Badge tone="neutral">{meta?.targetKinds.find((k) => k.value === target.kind)?.label ?? target.kind}</Badge>
                      <StatusBadge status={target.status} meta={meta} />
                      {target.deadline && (
                        <Tooltip label="Deadline as you recorded it">
                          <Badge tone="warning">{truncate(target.deadline, 28)}</Badge>
                        </Tooltip>
                      )}
                    </div>

                    <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                      {[target.organization, target.department, [target.city, target.country].filter(Boolean).join(', ')]
                        .filter(Boolean)
                        .join(' · ') || 'No organisation recorded'}
                    </p>

                    {target.focusAreas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {target.focusAreas.slice(0, 4).map((area) => (
                          <span key={area} className="text-[0.6875rem] text-[var(--color-text-faint)]">
                            {area}
                            {area !== target.focusAreas.slice(0, 4).at(-1) && ' ·'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="hidden shrink-0 items-center gap-3 pt-1 sm:flex">
                    {target.lastRunId ? (
                      <Link
                        href={`/runs/${target.lastRunId}`}
                        className="text-[0.6875rem] text-[var(--color-accent)] hover:underline"
                      >
                        Last run {timeAgo(target.lastRunAt)}
                      </Link>
                    ) : (
                      <span className="text-[0.6875rem] text-[var(--color-text-faint)]">Not run yet</span>
                    )}

                    {target.links[0]?.url && (
                      <a
                        href={target.links[0].url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-accent)]"
                        aria-label={`Open ${target.links[0].label}`}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}

                    <Button variant="ghost" size="iconSm" onClick={() => setEditing(target)} aria-label={`Edit ${target.name}`}>
                      <Pencil />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </PageBody>

      <TargetDialog
        open={adding || Boolean(editing)}
        target={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={() => mutate()}
      />

      <ImportDialog open={importing} onClose={() => setImporting(false)} onImported={() => mutate()} />
    </>
  );
}

function StatusBadge({ status, meta }: { status: string; meta?: Meta }) {
  const option = meta?.targetStatuses.find((s) => s.value === status);
  const tone = (option?.tone ?? 'neutral') as 'neutral' | 'accent' | 'positive' | 'negative' | 'muted' | 'progress';
  return <Badge tone={tone}>{option?.label ?? status}</Badge>;
}

/**
 * Create and edit share one dialog.
 *
 * Five fields, matching the shape people already keep these lists in: a name,
 * where they are, and the links worth reading. Everything the schema can hold
 * beyond that is either set by a run or not worth asking for up front.
 */
function TargetDialog({
  open,
  target,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: Target | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = React.useState(() => emptyTarget());
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    if (!target) {
      setForm(emptyTarget());
      return;
    }

    // Links are stored as a labelled list; unpack them back into the fields.
    const find = (label: string) => target.links.find((l) => l.label === label)?.url ?? '';
    const known = new Set(['Website', 'Google Scholar']);

    setForm({
      name: target.name,
      university: target.organization,
      website: find('Website'),
      googleScholar: find('Google Scholar'),
      others: target.links.filter((l) => !known.has(l.label)).map((l) => l.url).join('\n'),
    });
  }, [open, target]);

  const set = <K extends keyof ReturnType<typeof emptyTarget>>(key: K, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const links: { id: string; label: string; url: string }[] = [];
    const add = (label: string, url: string) => {
      const cleaned = url.trim();
      if (cleaned) links.push({ id: `lnk_${Math.random().toString(36).slice(2, 9)}`, label, url: cleaned });
    };

    add('Website', form.website);
    add('Google Scholar', form.googleScholar);
    for (const line of form.others.split('\n')) add('Link', line);

    const payload = { name: form.name.trim(), organization: form.university.trim(), links };

    try {
      if (target) await api.patch(`/api/targets/${target.id}`, payload);
      else await api.post('/api/targets', payload);

      onSaved();
      onClose();
      toast.success(target ? 'Target updated' : 'Target added', form.name.trim());
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await api.delete(`/api/targets/${target.id}`);
      onSaved();
      onClose();
      toast.success('Deleted', target.name);
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title={target ? 'Edit target' : 'Add a target'} description="Only a name is required.">
        <DialogBody className="space-y-4">
          <Field label="Name" required>
            {({ id }) => (
              <Input id={id} autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Maya Lindqvist" />
            )}
          </Field>

          <Field label="University">
            {({ id }) => <Input id={id} value={form.university} onChange={(e) => set('university', e.target.value)} placeholder="UNL" />}
          </Field>

          <Field label="Website">
            {({ id }) => (
              <Input
                id={id}
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://example.edu/people/m-lindqvist"
                className="font-[family-name:var(--font-mono)] text-xs"
              />
            )}
          </Field>

          <Field label="Google Scholar">
            {({ id }) => (
              <Input
                id={id}
                value={form.googleScholar}
                onChange={(e) => set('googleScholar', e.target.value)}
                placeholder="https://scholar.google.com/citations?user=..."
                className="font-[family-name:var(--font-mono)] text-xs"
              />
            )}
          </Field>

          <Field label="Other links" hint="One per line.">
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                value={form.others}
                onChange={(e) => set('others', e.target.value)}
                placeholder={'https://m-lindqvist.example\nhttps://example.org/lab'}
                className="font-[family-name:var(--font-mono)] text-xs"
              />
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          {target && (
            <Button variant="dangerGhost" onClick={remove} loading={deleting} className="mr-auto">
              <Trash2 />
              Delete
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" onClick={save} loading={saving} disabled={!form.name.trim()}>
            {target ? 'Save changes' : 'Add target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const JSON_EXAMPLE = `[
  {
    "name": "Dr. Maya Lindqvist",
    "university": "Uppsala University",
    "website": "https://example.edu/people/m-lindqvist",
    "google_scholar": "https://scholar.google.com/citations?user=EXAMPLE123",
    "others": [
      "https://m-lindqvist.example",
      "https://example.org/lab"
    ]
  }
]`;

const CSV_EXAMPLE = [
  'name,university,website,google_scholar,others',
  'Dr. Maya Lindqvist,Uppsala University,https://example.edu/people/m-lindqvist,https://scholar.google.com/citations?user=EXAMPLE123,https://m-lindqvist.example;https://example.org/lab',
].join('\n');

function emptyTarget() {
  return { name: '', university: '', website: '', googleScholar: '', others: '' };
}

/**
 * Import.
 *
 * Previews before writing, and reports per-row problems rather than rejecting
 * the file. People paste imperfect lists; losing ninety-nine good rows to one
 * bad one is not acceptable.
 */
function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const toast = useToast();
  const [format, setFormat] = React.useState<'json' | 'csv'>('json');
  const [content, setContent] = React.useState('');
  const [preview, setPreview] = React.useState<{ total: number; preview: { row: number; ok: boolean; data: Record<string, unknown> | null; reason: string }[] } | null>(null);
  // Which action is in flight. Inferring this from whether a preview exists
  // put the spinner on the wrong button and left Import clickable twice.
  const [busy, setBusy] = React.useState<'preview' | 'import' | null>(null);

  React.useEffect(() => {
    if (!open) {
      setContent('');
      setPreview(null);
    }
  }, [open]);

  const runPreview = async () => {
    setBusy('preview');
    try {
      const result = await api.post<typeof preview>('/api/targets/import/preview', { format, content });
      setPreview(result);
    } catch (err) {
      toast.error('Could not read that', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    setBusy('import');
    try {
      const result = await api.post<{ imported: number; skipped: { row: number; reason: string }[] }>('/api/targets/import', {
        format,
        content,
      });
      onImported();
      onClose();
      toast.success(
        `Imported ${result.imported} target${result.imported === 1 ? '' : 's'}`,
        result.skipped.length ? `${result.skipped.length} row${result.skipped.length === 1 ? '' : 's'} skipped.` : undefined,
      );
    } catch (err) {
      toast.error('Import failed', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setBusy(null);
    }
  };

  const readFile = async (file: File) => {
    const text = await file.text();
    setContent(text);
    setFormat(file.name.endsWith('.json') ? 'json' : 'csv');
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent wide title="Import targets" description="Paste a list or choose a file. Duplicates are skipped automatically.">
        <DialogBody className="space-y-4">
          <Tabs value={format} onValueChange={(value) => { setFormat(value as 'json' | 'csv'); setPreview(null); }}>
            <TabsList>
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="csv">CSV or TSV</TabsTrigger>
            </TabsList>

            <TabsContent value="json" className="pt-4">
              <Notice tone="neutral">
                An array of objects with{' '}
                <code className="font-[family-name:var(--font-mono)]">name</code>,{' '}
                <code className="font-[family-name:var(--font-mono)]">university</code>,{' '}
                <code className="font-[family-name:var(--font-mono)]">website</code>,{' '}
                <code className="font-[family-name:var(--font-mono)]">google_scholar</code>, and{' '}
                <code className="font-[family-name:var(--font-mono)]">others</code>.
              </Notice>
            </TabsContent>

            <TabsContent value="csv" className="pt-4">
              <Notice tone="neutral">
                First row is the header:{' '}
                <code className="font-[family-name:var(--font-mono)]">name,university,website,google_scholar,others</code>.
                Put several other links in one cell separated by semicolons.
              </Notice>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".json,.csv,.tsv,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readFile(file);
              }}
              className="block w-full text-xs text-[var(--color-text-muted)] file:mr-3 file:cursor-pointer file:rounded-[var(--radius-control)] file:border file:border-[var(--color-border-strong)] file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--color-text)]"
            />
          </div>

          <Field label="Content" aside={`${content.length} characters`}>
            {({ id }) => (
              <Textarea
                id={id}
                rows={10}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setPreview(null);
                }}
                placeholder={
                  format === 'json'
                    ? JSON_EXAMPLE
                    : CSV_EXAMPLE
                }
                className="font-[family-name:var(--font-mono)] text-xs"
              />
            )}
          </Field>

          {preview && (
            <div className="space-y-2">
              <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">
                {preview.total} row{preview.total === 1 ? '' : 's'} found
                {preview.preview.some((p) => !p.ok) && `, ${preview.preview.filter((p) => !p.ok).length} with problems`}
              </p>
              <div className="max-h-56 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--color-border)]">
                {preview.preview.map((row) => (
                  <div
                    key={row.row}
                    className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2 text-xs last:border-b-0"
                  >
                    <span className="numeric w-6 shrink-0 text-[var(--color-text-faint)]">{row.row}</span>
                    {row.ok ? (
                      <>
                        <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">{String(row.data?.name ?? '')}</span>
                        <Badge tone="neutral">{String(row.data?.kind ?? '')}</Badge>
                        <span className="shrink-0 text-[var(--color-text-faint)]">{String(row.data?.organization ?? '')}</span>
                      </>
                    ) : (
                      <span className="flex-1 text-[var(--color-rose)]">{row.reason}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="secondary"
            onClick={runPreview}
            loading={busy === 'preview'}
            disabled={!content.trim() || busy !== null}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={runImport}
            loading={busy === 'import'}
            disabled={!content.trim() || busy !== null}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
