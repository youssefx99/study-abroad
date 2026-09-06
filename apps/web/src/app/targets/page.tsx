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
  const [kind, setKind] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<Target | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  if (kind) query.set('kind', kind);
  if (status) query.set('status', status);
  if (country) query.set('country', country);

  const key = `/api/targets${query.toString() ? `?${query}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<{ data: Target[]; meta: { facets: TargetFacets; total: number } }>(
    key,
    (path: string) => api.getWithMeta<Target[]>(path) as Promise<{ data: Target[]; meta: { facets: TargetFacets; total: number } }>,
  );
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);

  const targets = data?.data ?? [];
  const facets = data?.meta?.facets;
  const hasFilters = Boolean(search || kind || status || country);

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
              placeholder="Search names, organisations, notes, focus areas"
              className="pl-9"
            />
          </div>

          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto min-w-[8.5rem]" aria-label="Filter by kind">
            <option value="">All kinds</option>
            {(facets?.kinds ?? []).map((facet) => (
              <option key={facet.value} value={facet.value}>
                {meta?.targetKinds.find((k) => k.value === facet.value)?.label ?? facet.value} ({facet.count})
              </option>
            ))}
          </Select>

          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[8.5rem]" aria-label="Filter by status">
            <option value="">All statuses</option>
            {(facets?.statuses ?? []).map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </Select>

          <Select value={country} onChange={(e) => setCountry(e.target.value)} className="w-auto min-w-[8.5rem]" aria-label="Filter by country">
            <option value="">All countries</option>
            {(facets?.countries ?? []).map((facet) => (
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
                setKind('');
                setStatus('');
                setCountry('');
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
        meta={meta}
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

/** Create and edit share one dialog: the fields are identical. */
function TargetDialog({
  open,
  target,
  meta,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: Target | null;
  meta?: Meta;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = React.useState(() => emptyTarget());
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(target ? { ...emptyTarget(), ...target } : emptyTarget());
  }, [open, target]);

  const set = <K extends keyof ReturnType<typeof emptyTarget>>(key: K, value: ReturnType<typeof emptyTarget>[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      kind: form.kind,
      name: form.name.trim(),
      organization: form.organization,
      department: form.department,
      country: form.country,
      city: form.city,
      email: form.email,
      focusAreas: form.focusAreas,
      deadline: form.deadline,
      language: form.language,
      status: form.status,
      priority: form.priority,
      notes: form.notes,
      tags: form.tags,
      links: form.links,
    };

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
      <DialogContent
        wide
        title={target ? 'Edit target' : 'Add a target'}
        description="Only a name is required. Everything else improves the research and the draft."
      >
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="Kind">
              {({ id }) => (
                <Select id={id} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                  {(meta?.targetKinds ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Name" required hint={meta?.targetKinds.find((k) => k.value === form.kind)?.hint}>
              {({ id }) => (
                <Input id={id} autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Prof. Lena Hartmann" />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation">
              {({ id }) => <Input id={id} value={form.organization} onChange={(e) => set('organization', e.target.value)} />}
            </Field>
            <Field label="Department or group">
              {({ id }) => <Input id={id} value={form.department} onChange={(e) => set('department', e.target.value)} />}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Country">{({ id }) => <Input id={id} value={form.country} onChange={(e) => set('country', e.target.value)} />}</Field>
            <Field label="City">{({ id }) => <Input id={id} value={form.city} onChange={(e) => set('city', e.target.value)} />}</Field>
            <Field label="Email">{({ id }) => <Input id={id} value={form.email} onChange={(e) => set('email', e.target.value)} />}</Field>
          </div>

          <Field label="Links" hint="Website, Scholar, programme page. One per line as: Label | URL">
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                value={form.links.map((l) => `${l.label} | ${l.url}`).join('\n')}
                onChange={(e) =>
                  set(
                    'links',
                    e.target.value
                      .split('\n')
                      .map((line) => {
                        const [label, ...rest] = line.split('|');
                        return { id: `lnk_${Math.random().toString(36).slice(2, 9)}`, label: label.trim(), url: rest.join('|').trim() };
                      })
                      .filter((l) => l.label || l.url),
                  )
                }
                placeholder={'Website | https://example.edu/hartmann\nGoogle Scholar | https://scholar.google.com/...'}
                className="font-[family-name:var(--font-mono)] text-xs"
              />
            )}
          </Field>

          <Field label="Focus areas" hint="What they work on, as far as you know. Research fills in the rest.">
            {() => (
              <ChipListEditor values={form.focusAreas} onChange={(values) => set('focusAreas', values)} placeholder="Add a focus area" />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Status">
              {({ id }) => (
                <Select id={id} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {(meta?.targetStatuses ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Priority" hint="1 is highest">
              {({ id }) => (
                <Select id={id} value={String(form.priority)} onChange={(e) => set('priority', Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Write in" hint="Language for this target">
              {({ id }) => (
                <Select id={id} value={form.language} onChange={(e) => set('language', e.target.value)}>
                  {(meta?.languages ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Deadline" hint="Free text">
              {({ id }) => <Input id={id} value={form.deadline} onChange={(e) => set('deadline', e.target.value)} placeholder="1 Dec 2026" />}
            </Field>
          </div>

          <Field label="Notes" hint="Anything you already know. This goes into the prompt.">
            {({ id }) => <Textarea id={id} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>

          <Field label="Tags">
            {() => <ChipListEditor values={form.tags} onChange={(values) => set('tags', values)} placeholder="Add a tag" />}
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

function emptyTarget() {
  return {
    kind: 'professor',
    name: '',
    organization: '',
    department: '',
    country: '',
    city: '',
    email: '',
    focusAreas: [] as string[],
    deadline: '',
    language: 'en',
    status: 'new',
    priority: 3,
    notes: '',
    tags: [] as string[],
    links: [] as { id: string; label: string; url: string }[],
  };
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
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setContent('');
      setPreview(null);
    }
  }, [open]);

  const runPreview = async () => {
    setBusy(true);
    try {
      const result = await api.post<typeof preview>('/api/targets/import/preview', { format, content });
      setPreview(result);
    } catch (err) {
      toast.error('Could not read that', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
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
      setBusy(false);
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
                An array of objects. Recognised keys include <code className="font-[family-name:var(--font-mono)]">name</code>,{' '}
                <code className="font-[family-name:var(--font-mono)]">organization</code> or{' '}
                <code className="font-[family-name:var(--font-mono)]">university</code>,{' '}
                <code className="font-[family-name:var(--font-mono)]">country</code>,{' '}
                <code className="font-[family-name:var(--font-mono)]">website</code>,{' '}
                <code className="font-[family-name:var(--font-mono)]">google_scholar</code>, and{' '}
                <code className="font-[family-name:var(--font-mono)]">others</code>.
              </Notice>
            </TabsContent>

            <TabsContent value="csv" className="pt-4">
              <Notice tone="neutral">
                First row is the header. Column names are matched loosely, so a spreadsheet export usually works as-is.
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
                    ? '[\n  { "name": "Prof. Lena Hartmann", "university": "RWTH Aachen", "country": "Germany", "website": "https://…" }\n]'
                    : 'name,organization,country,website\nProf. Lena Hartmann,RWTH Aachen,Germany,https://…'
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
          <Button variant="secondary" onClick={runPreview} loading={busy && !preview} disabled={!content.trim()}>
            Preview
          </Button>
          <Button variant="primary" onClick={runImport} loading={busy && Boolean(preview)} disabled={!content.trim()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
