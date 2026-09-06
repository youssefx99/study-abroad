'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { UserRound, Plus, Search, Copy, Trash2 } from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { ProfileSummary } from '@/lib/types';
import { timeAgo, truncate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import {
  Panel,
  EmptyState,
  Progress,
  Badge,
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock } from '@/components/shared';

/**
 * Applicants.
 *
 * Plural on purpose. One student uses this with a single profile; a counsellor
 * or an agency runs dozens. The same screen serves both without a mode switch.
 */
export default function ApplicantsPage() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const { data, error, isLoading, mutate } = useSWR<ProfileSummary[]>('/api/profiles', fetcher);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((p) =>
      [p.fullName, p.headline, p.countryOfResidence, p.targetDegree, ...p.researchInterests, ...p.tags]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [data, search]);

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true);

    try {
      const profile = await api.post<{ id: string }>('/api/profiles', { fullName: newName.trim() });
      toast.success('Applicant created', 'Fill in the sections to improve every draft.');
      router.push(`/applicants/${profile.id}`);
    } catch (err) {
      toast.error('Could not create the applicant', err instanceof ApiError ? err.message : 'Unexpected error');
      setSaving(false);
    }
  };

  const duplicate = async (id: string, name: string) => {
    try {
      await api.post(`/api/profiles/${id}/duplicate`);
      await mutate();
      toast.success('Copied', `"${name}" was duplicated.`);
    } catch (err) {
      toast.error('Could not duplicate', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const remove = async (id: string, name: string) => {
    try {
      await api.delete(`/api/profiles/${id}`);
      await mutate();
      toast.success('Deleted', `"${name}" was removed.`);
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  return (
    <>
      <PageHeader
        title="Applicants"
        description="The person applying. Everything the system writes is built from this profile, so the more it holds the less generic the drafts are."
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            New applicant
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {data && data.length > 3 && (
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, field, or country"
              aria-label="Search applicants"
              className="pl-9"
            />
          </div>
        )}

        {error ? (
          <ErrorBlock error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <Panel>
            <LoadingBlock label="Loading applicants" />
          </Panel>
        ) : !filtered.length ? (
          <Panel>
            <EmptyState
              icon={<UserRound className="size-7" />}
              title={data?.length ? 'Nothing matches that search' : 'No applicants yet'}
              description={
                data?.length
                  ? 'Try a different name, field, or country.'
                  : 'Create a profile with your background, what you are applying for, and your research interests.'
              }
              action={
                !data?.length ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus />
                    Create the first profile
                  </Button>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((profile) => (
              <Panel key={profile.id} className="flex flex-col">
                <Link href={`/applicants/${profile.id}`} className="flex-1 p-5 transition-colors hover:bg-[var(--color-surface-sunken)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[0.9375rem] font-semibold text-[var(--color-text)]">{profile.fullName}</h2>
                      {profile.headline && (
                        <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
                          {truncate(profile.headline, 92)}
                        </p>
                      )}
                    </div>
                    <Badge tone={profile.completeness.percent >= 70 ? 'positive' : 'warning'}>
                      {profile.completeness.percent}%
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Progress
                      value={profile.completeness.percent}
                      tone={profile.completeness.percent >= 70 ? 'positive' : 'warning'}
                    />
                    <p className="text-[0.6875rem] text-[var(--color-text-faint)]">
                      {profile.completeness.missing.length
                        ? `Next: ${profile.completeness.missing[0].label.toLowerCase()}`
                        : 'Everything filled in'}
                    </p>
                  </div>

                  {profile.researchInterests.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {profile.researchInterests.slice(0, 3).map((interest) => (
                        <Badge key={interest} tone="neutral">
                          {truncate(interest, 26)}
                        </Badge>
                      ))}
                      {profile.researchInterests.length > 3 && (
                        <Badge tone="muted">+{profile.researchInterests.length - 3}</Badge>
                      )}
                    </div>
                  )}
                </Link>

                <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 py-2">
                  <p className="pl-1 text-[0.6875rem] text-[var(--color-text-faint)]">Edited {timeAgo(profile.updatedAt)}</p>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => duplicate(profile.id, profile.fullName)}
                      aria-label={`Duplicate ${profile.fullName}`}
                    >
                      <Copy />
                    </Button>
                    <Button
                      variant="dangerGhost"
                      size="iconSm"
                      onClick={() => remove(profile.id, profile.fullName)}
                      aria-label={`Delete ${profile.fullName}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </PageBody>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          title="New applicant"
          description="Start with a name. Every other field can be filled in afterwards."
        >
          <DialogBody>
            <Field label="Full name" required hint="Written exactly as it should appear in a signature.">
              {({ id }) => (
                <Input
                  id={id}
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && create()}
                  placeholder="e.g. Amara Okonkwo"
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" onClick={create} loading={saving} disabled={!newName.trim()}>
              Create and open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
