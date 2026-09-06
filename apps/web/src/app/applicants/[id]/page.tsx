'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Save, Eye, CheckCircle2, Circle, ArrowLeft } from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { Profile, Meta } from '@/lib/types';
import { localId, cn, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select, ComboInput } from '@/components/ui/field';
import { Panel, PanelHeader, Tabs, TabsList, TabsTrigger, TabsContent, Progress, Badge, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  PageBody,
  PageHeader,
  LoadingBlock,
  ErrorBlock,
  ChipListEditor,
  RepeaterSection,
  CustomFieldsEditor,
  CopyButton,
} from '@/components/shared';

/**
 * Profile editor.
 *
 * Tabbed rather than one long scroll, because the whole record is thirty fields
 * across seven concerns and a single column of them is unreadable. The
 * completeness rail stays visible across every tab so the effect of filling
 * something in is immediate.
 *
 * Nothing here is required except a name. Applicants arrive mid-process with
 * partial information, and a form that refuses to save until it is perfect just
 * loses the work they did have.
 */
export default function ApplicantEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();

  const { data, error, isLoading, mutate } = useSWR<Profile>(`/api/profiles/${id}`, fetcher);
  const { data: meta } = useSWR<Meta>('/api/meta', fetcher);

  const [draft, setDraft] = React.useState<Profile | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState('basics');

  React.useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  const dirty = React.useMemo(() => {
    if (!draft || !data) return false;
    // Compare only the editable surface; server-derived fields change on save.
    const strip = (p: Profile) => JSON.stringify({ ...p, completeness: undefined, promptBlock: undefined, updatedAt: '' });
    return strip(draft) !== strip(data);
  }, [draft, data]);

  // A browser-level guard, because losing a half-written research statement to
  // a stray back gesture is the kind of thing people do not forgive.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = React.useCallback(<K extends keyof Profile>(key: K, value: Profile[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const save = async () => {
    if (!draft) return;
    setSaving(true);

    try {
      const { id: _id, createdAt, updatedAt, completeness, promptBlock, ...payload } = draft;
      const saved = await api.patch<Profile>(`/api/profiles/${id}`, payload);
      setDraft(saved);
      await mutate(saved, false);
      toast.success('Saved', `Profile is ${saved.completeness?.percent ?? 0}% complete.`);
    } catch (err) {
      toast.error(
        'Could not save',
        err instanceof ApiError
          ? err.issues.length
            ? err.issues.map((i) => `${i.field}: ${i.message}`).join('; ')
            : err.message
          : 'Unexpected error',
      );
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S is muscle memory for anyone writing a long document.
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (error) {
    return (
      <PageBody>
        <ErrorBlock error={error} onRetry={() => mutate()} />
      </PageBody>
    );
  }

  if (isLoading || !draft) {
    return (
      <PageBody>
        <Panel>
          <LoadingBlock label="Loading profile" />
        </Panel>
      </PageBody>
    );
  }

  const completeness = data?.completeness;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/applicants', label: 'Applicants' },
          { href: `/applicants/${id}`, label: draft.fullName || 'Untitled' },
        ]}
        title={draft.fullName || 'Untitled applicant'}
        description={draft.headline || 'Add a headline so every draft opens with a clear one-line introduction.'}
        action={
          <>
            <Button variant="ghost" onClick={() => router.push('/applicants')}>
              <ArrowLeft />
              Back
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
              <Save />
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Panel className="overflow-hidden">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="px-2">
                <TabsTrigger value="basics">Basics</TabsTrigger>
                <TabsTrigger value="education">Education</TabsTrigger>
                <TabsTrigger value="tests">Tests &amp; languages</TabsTrigger>
                <TabsTrigger value="research">Research</TabsTrigger>
                <TabsTrigger value="experience">Experience</TabsTrigger>
                <TabsTrigger value="links">Links &amp; documents</TabsTrigger>
                <TabsTrigger value="extra">Extra</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <div className="p-5">
                <TabsContent value="basics" className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name" required hint="As it should appear in a signature.">
                      {({ id: fieldId }) => (
                        <Input id={fieldId} value={draft.fullName} onChange={(e) => update('fullName', e.target.value)} />
                      )}
                    </Field>
                    <Field label="Email">
                      {({ id: fieldId }) => (
                        <Input id={fieldId} type="email" value={draft.email} onChange={(e) => update('email', e.target.value)} />
                      )}
                    </Field>
                  </div>

                  <Field
                    label="Headline"
                    hint="One line on who you are. This shapes the opening sentence of every message."
                  >
                    {({ id: fieldId }) => (
                      <Input
                        id={fieldId}
                        value={draft.headline}
                        onChange={(e) => update('headline', e.target.value)}
                        placeholder="e.g. Environmental engineer working on low-cost water quality monitoring"
                      />
                    )}
                  </Field>

                  <Field
                    label="Summary"
                    hint="A paragraph of background in your own words. Longer is fine."
                    aside={`${draft.summary.length} characters`}
                  >
                    {({ id: fieldId }) => (
                      <Textarea id={fieldId} rows={6} value={draft.summary} onChange={(e) => update('summary', e.target.value)} />
                    )}
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Nationality">
                      {({ id: fieldId }) => (
                        <Input id={fieldId} value={draft.nationality} onChange={(e) => update('nationality', e.target.value)} />
                      )}
                    </Field>
                    <Field label="Country of residence">
                      {({ id: fieldId }) => (
                        <Input
                          id={fieldId}
                          value={draft.countryOfResidence}
                          onChange={(e) => update('countryOfResidence', e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="City">
                      {({ id: fieldId }) => <Input id={fieldId} value={draft.city} onChange={(e) => update('city', e.target.value)} />}
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Applying for">
                      {({ id: fieldId }) => (
                        <Select id={fieldId} value={draft.targetDegree} onChange={(e) => update('targetDegree', e.target.value)}>
                          {(meta?.degreeLevels ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="Intake" hint="e.g. Autumn 2027">
                      {({ id: fieldId }) => (
                        <Input id={fieldId} value={draft.targetIntake} onChange={(e) => update('targetIntake', e.target.value)} />
                      )}
                    </Field>
                    <Field label="Funding">
                      {({ id: fieldId }) => (
                        <Select id={fieldId} value={draft.fundingNeed} onChange={(e) => update('fundingNeed', e.target.value)}>
                          {(meta?.fundingNeeds ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  </div>

                  <Field label="Preferred destinations" hint="Countries or regions you are targeting.">
                    {() => (
                      <ChipListEditor
                        values={draft.targetCountries}
                        onChange={(values) => update('targetCountries', values)}
                        placeholder="Add a country and press Enter"
                      />
                    )}
                  </Field>
                </TabsContent>

                <TabsContent value="education">
                  <RepeaterSection
                    title="Education"
                    description="Grades are stored as a value plus the scale they came from, so any national system fits."
                    items={draft.education}
                    onChange={(items) => update('education', items)}
                    addLabel="Add degree"
                    emptyHint="No degrees yet. Add at least one so drafts can reference your background."
                    makeEmpty={() => ({
                      id: localId('edu'),
                      degree: '',
                      field: '',
                      institution: '',
                      country: '',
                      startYear: '',
                      endYear: '',
                      gradeValue: '',
                      gradeScale: '',
                      thesisTitle: '',
                      notes: '',
                    })}
                    renderItem={(item, patch) => (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Degree">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.degree} onChange={(e) => patch({ degree: e.target.value })} placeholder="BEng, MSc, Licence" />
                            )}
                          </Field>
                          <Field label="Field">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.field} onChange={(e) => patch({ field: e.target.value })} placeholder="Civil Engineering" />
                            )}
                          </Field>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Institution">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.institution} onChange={(e) => patch({ institution: e.target.value })} />
                            )}
                          </Field>
                          <Field label="Country">
                            {({ id: fid }) => <Input id={fid} value={item.country} onChange={(e) => patch({ country: e.target.value })} />}
                          </Field>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                          <Field label="From">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.startYear} onChange={(e) => patch({ startYear: e.target.value })} placeholder="2018" />
                            )}
                          </Field>
                          <Field label="To">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.endYear} onChange={(e) => patch({ endYear: e.target.value })} placeholder="2023" />
                            )}
                          </Field>
                          <Field label="Grade">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.gradeValue} onChange={(e) => patch({ gradeValue: e.target.value })} placeholder="4.42" />
                            )}
                          </Field>
                          <Field label="Out of" hint="Free text">
                            {({ id: fid }) => (
                              <ComboInput
                                id={fid}
                                listId={`scales-${item.id}`}
                                options={meta?.gradeScales ?? []}
                                value={item.gradeScale}
                                onChange={(e) => patch({ gradeScale: e.target.value })}
                                placeholder="5.0 GPA"
                              />
                            )}
                          </Field>
                        </div>

                        <Field label="Thesis title" hint="Optional, but often the strongest thing to mention.">
                          {({ id: fid }) => (
                            <Input id={fid} value={item.thesisTitle} onChange={(e) => patch({ thesisTitle: e.target.value })} />
                          )}
                        </Field>
                      </div>
                    )}
                  />
                </TabsContent>

                <TabsContent value="tests" className="space-y-8">
                  <RepeaterSection
                    title="Test scores"
                    description="Any test. The name is free text, so national and language exams both fit."
                    items={draft.tests}
                    onChange={(items) => update('tests', items)}
                    addLabel="Add test"
                    emptyHint="No tests recorded. Add language or admission tests if you have them."
                    makeEmpty={() => ({ id: localId('tst'), name: '', score: '', maxScore: '', takenOn: '', expiresOn: '', notes: '' })}
                    renderItem={(item, patch) => (
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Field label="Test" className="sm:col-span-2">
                          {({ id: fid }) => (
                            <ComboInput
                              id={fid}
                              listId={`tests-${item.id}`}
                              options={meta?.tests ?? []}
                              value={item.name}
                              onChange={(e) => patch({ name: e.target.value })}
                              placeholder="IELTS Academic"
                            />
                          )}
                        </Field>
                        <Field label="Score">
                          {({ id: fid }) => <Input id={fid} value={item.score} onChange={(e) => patch({ score: e.target.value })} />}
                        </Field>
                        <Field label="Out of">
                          {({ id: fid }) => <Input id={fid} value={item.maxScore} onChange={(e) => patch({ maxScore: e.target.value })} />}
                        </Field>
                        <Field label="Taken on" className="sm:col-span-2">
                          {({ id: fid }) => (
                            <Input id={fid} value={item.takenOn} onChange={(e) => patch({ takenOn: e.target.value })} placeholder="2026-03-14" />
                          )}
                        </Field>
                        <Field label="Valid until" className="sm:col-span-2">
                          {({ id: fid }) => <Input id={fid} value={item.expiresOn} onChange={(e) => patch({ expiresOn: e.target.value })} />}
                        </Field>
                      </div>
                    )}
                  />

                  <RepeaterSection
                    title="Languages"
                    items={draft.languages}
                    onChange={(items) => update('languages', items)}
                    addLabel="Add language"
                    emptyHint="No languages listed. Worth adding if you are applying outside English-speaking countries."
                    makeEmpty={() => ({ id: localId('lng'), language: '', level: '' })}
                    renderItem={(item, patch) => (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Language">
                          {({ id: fid }) => <Input id={fid} value={item.language} onChange={(e) => patch({ language: e.target.value })} />}
                        </Field>
                        <Field label="Level" hint="CEFR or your own description">
                          {({ id: fid }) => (
                            <ComboInput
                              id={fid}
                              listId={`levels-${item.id}`}
                              options={meta?.languageLevels ?? []}
                              value={item.level}
                              onChange={(e) => patch({ level: e.target.value })}
                            />
                          )}
                        </Field>
                      </div>
                    )}
                  />
                </TabsContent>

                <TabsContent value="research" className="space-y-6">
                  <Field
                    label="Research interests"
                    hint="These drive the fit analysis. Be specific: a topic beats a discipline."
                  >
                    {() => (
                      <ChipListEditor
                        values={draft.researchInterests}
                        onChange={(values) => update('researchInterests', values)}
                        placeholder="Add an interest and press Enter"
                      />
                    )}
                  </Field>

                  <Field
                    label="Research statement"
                    hint="What you want to work on and why. The single field with the biggest effect on draft quality."
                    aside={`${draft.researchStatement.length} characters`}
                  >
                    {({ id: fieldId }) => (
                      <Textarea
                        id={fieldId}
                        rows={8}
                        value={draft.researchStatement}
                        onChange={(e) => update('researchStatement', e.target.value)}
                      />
                    )}
                  </Field>

                  <Field label="Skills">
                    {() => (
                      <ChipListEditor
                        values={draft.skills}
                        onChange={(values) => update('skills', values)}
                        placeholder="Add a skill and press Enter"
                      />
                    )}
                  </Field>

                  <RepeaterSection
                    title="Publications and submissions"
                    description="Include work under review. Say so in the role field rather than overstating it."
                    items={draft.publications}
                    onChange={(items) => update('publications', items)}
                    addLabel="Add publication"
                    emptyHint="Nothing listed. This section is optional, and its absence is not held against you."
                    makeEmpty={() => ({ id: localId('pub'), title: '', venue: '', year: '', url: '', role: '', summary: '' })}
                    renderItem={(item, patch) => (
                      <div className="space-y-3">
                        <Field label="Title">
                          {({ id: fid }) => <Input id={fid} value={item.title} onChange={(e) => patch({ title: e.target.value })} />}
                        </Field>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Venue">
                            {({ id: fid }) => <Input id={fid} value={item.venue} onChange={(e) => patch({ venue: e.target.value })} />}
                          </Field>
                          <Field label="Year">
                            {({ id: fid }) => <Input id={fid} value={item.year} onChange={(e) => patch({ year: e.target.value })} />}
                          </Field>
                          <Field label="Your role" hint="First author, under review…">
                            {({ id: fid }) => <Input id={fid} value={item.role} onChange={(e) => patch({ role: e.target.value })} />}
                          </Field>
                        </div>
                        <Field label="One-line summary">
                          {({ id: fid }) => <Input id={fid} value={item.summary} onChange={(e) => patch({ summary: e.target.value })} />}
                        </Field>
                      </div>
                    )}
                  />
                </TabsContent>

                <TabsContent value="experience">
                  <RepeaterSection
                    title="Experience"
                    description="Research roles, industry work, internships, teaching. Anything relevant."
                    items={draft.experience}
                    onChange={(items) => update('experience', items)}
                    addLabel="Add role"
                    emptyHint="Nothing listed yet."
                    makeEmpty={() => ({ id: localId('exp'), role: '', organization: '', country: '', startDate: '', endDate: '', summary: '' })}
                    renderItem={(item, patch) => (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Role">
                            {({ id: fid }) => <Input id={fid} value={item.role} onChange={(e) => patch({ role: e.target.value })} />}
                          </Field>
                          <Field label="Organisation">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.organization} onChange={(e) => patch({ organization: e.target.value })} />
                            )}
                          </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Country">
                            {({ id: fid }) => <Input id={fid} value={item.country} onChange={(e) => patch({ country: e.target.value })} />}
                          </Field>
                          <Field label="From">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.startDate} onChange={(e) => patch({ startDate: e.target.value })} placeholder="2023-09" />
                            )}
                          </Field>
                          <Field label="To">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.endDate} onChange={(e) => patch({ endDate: e.target.value })} placeholder="present" />
                            )}
                          </Field>
                        </div>
                        <Field label="What you did">
                          {({ id: fid }) => (
                            <Textarea id={fid} rows={3} value={item.summary} onChange={(e) => patch({ summary: e.target.value })} />
                          )}
                        </Field>
                      </div>
                    )}
                  />
                </TabsContent>

                <TabsContent value="links" className="space-y-8">
                  <RepeaterSection
                    title="Links"
                    description="Label them however you like: Scholar, ORCID, GitHub, a portfolio, a lab page."
                    items={draft.links}
                    onChange={(items) => update('links', items)}
                    addLabel="Add link"
                    emptyHint="No links yet."
                    makeEmpty={() => ({ id: localId('lnk'), label: '', url: '' })}
                    renderItem={(item, patch) => (
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <Field label="Label">
                          {({ id: fid }) => (
                            <Input id={fid} value={item.label} onChange={(e) => patch({ label: e.target.value })} placeholder="Google Scholar" />
                          )}
                        </Field>
                        <Field label="URL">
                          {({ id: fid }) => <Input id={fid} value={item.url} onChange={(e) => patch({ url: e.target.value })} />}
                        </Field>
                      </div>
                    )}
                  />

                  <RepeaterSection
                    title="Documents"
                    description="Paste the text of your CV or transcript. Prompts read the text, so no upload is needed."
                    items={draft.documents}
                    onChange={(items) => update('documents', items)}
                    addLabel="Add document"
                    emptyHint="Nothing attached. Pasting your CV text is the fastest way to make drafts specific."
                    makeEmpty={() => ({ id: localId('doc'), label: '', kind: 'cv', url: '', text: '' })}
                    renderItem={(item, patch) => (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Label">
                            {({ id: fid }) => (
                              <Input id={fid} value={item.label} onChange={(e) => patch({ label: e.target.value })} placeholder="CV" />
                            )}
                          </Field>
                          <Field label="Kind">
                            {({ id: fid }) => (
                              <Select id={fid} value={item.kind} onChange={(e) => patch({ kind: e.target.value })}>
                                <option value="cv">CV</option>
                                <option value="transcript">Transcript</option>
                                <option value="sop">Statement of purpose</option>
                                <option value="recommendation">Recommendation</option>
                                <option value="portfolio">Portfolio</option>
                                <option value="other">Other</option>
                              </Select>
                            )}
                          </Field>
                        </div>
                        <Field label="Text" aside={`${formatNumber(item.text.length)} characters`}>
                          {({ id: fid }) => (
                            <Textarea
                              id={fid}
                              rows={8}
                              value={item.text}
                              onChange={(e) => patch({ text: e.target.value })}
                              placeholder="Paste the plain text of the document here."
                              className="font-[family-name:var(--font-mono)] text-xs"
                            />
                          )}
                        </Field>
                      </div>
                    )}
                  />
                </TabsContent>

                <TabsContent value="extra" className="space-y-6">
                  <Field label="Tags" hint="For your own filtering.">
                    {() => (
                      <ChipListEditor values={draft.tags} onChange={(values) => update('tags', values)} placeholder="Add a tag" />
                    )}
                  </Field>
                  <CustomFieldsEditor fields={draft.customFields} onChange={(fields) => update('customFields', fields)} />
                </TabsContent>

                <TabsContent value="preview" className="space-y-4">
                  <Notice tone="accent" icon={<Eye />} title="This is exactly what the model reads">
                    Every prompt that references <code className="font-[family-name:var(--font-mono)]">applicant.block</code> receives this
                    text verbatim. If something reads oddly here, it will read oddly in the draft.
                  </Notice>

                  {dirty && (
                    <Notice tone="warning">Save your changes to see them reflected in this preview.</Notice>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-[var(--color-text-faint)]">
                      {formatNumber(data?.promptBlock?.length ?? 0)} characters, roughly{' '}
                      {formatNumber(Math.round((data?.promptBlock?.length ?? 0) / 4))} tokens per call
                    </p>
                    <CopyButton value={data?.promptBlock ?? ''} label="Copy" variant="secondary" />
                  </div>

                  <pre className="scroll-x max-h-[560px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--color-text)]">
                    {data?.promptBlock || 'Nothing to preview yet.'}
                  </pre>
                </TabsContent>
              </div>
            </Tabs>
          </Panel>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Panel>
              <PanelHeader title="Profile strength" />
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-[family-name:var(--font-display)] text-[1.75rem] leading-none text-[var(--color-text)]">
                    {completeness?.percent ?? 0}%
                  </span>
                  <Badge tone={(completeness?.percent ?? 0) >= 70 ? 'positive' : 'warning'}>
                    {(completeness?.percent ?? 0) >= 70 ? 'Good' : 'Needs work'}
                  </Badge>
                </div>
                <Progress value={completeness?.percent ?? 0} tone={(completeness?.percent ?? 0) >= 70 ? 'positive' : 'warning'} />
                <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Weighted toward the fields that measurably improve a draft, not toward filling every box.
                </p>
              </div>

              <div className="border-t border-[var(--color-border)] px-2 py-2">
                {(completeness?.checks ?? []).map((check) => (
                  <div key={check.key} className="flex items-start gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5">
                    {check.done ? (
                      <CheckCircle2 className="mt-px size-3.5 shrink-0 text-[var(--color-signal)]" />
                    ) : (
                      <Circle className="mt-px size-3.5 shrink-0 text-[var(--color-text-faint)]" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-[0.8125rem]',
                          check.done ? 'text-[var(--color-text-muted)]' : 'font-medium text-[var(--color-text)]',
                        )}
                      >
                        {check.label}
                      </p>
                      {!check.done && <p className="text-[0.6875rem] leading-relaxed text-[var(--color-text-faint)]">{check.hint}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
