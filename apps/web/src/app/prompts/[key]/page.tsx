'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Save, RotateCcw, Copy, Trash2 } from 'lucide-react';
import { api, fetcher, ApiError } from '@/lib/api';
import type { Prompt } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Panel } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PageBody, PageHeader, LoadingBlock, ErrorBlock } from '@/components/shared';

/**
 * Prompt editor.
 *
 * Two text areas. The model, temperature, output schema, and web-search
 * settings are fixed per prompt and no longer surfaced — they were choices
 * nobody could make well without knowing the internals, and getting them wrong
 * broke runs in ways that were hard to trace back.
 *
 * Saving still writes a new version underneath, so a prompt that produced a run
 * stays readable exactly as it was. That history just is not something anyone
 * has to think about.
 */
export default function PromptEditorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const router = useRouter();
  const toast = useToast();

  const { data: prompt, error, isLoading, mutate } = useSWR<Prompt>(`/api/prompts/${key}`, fetcher);

  const [systemPrompt, setSystemPrompt] = React.useState('');
  const [userPrompt, setUserPrompt] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!prompt) return;
    setSystemPrompt(prompt.active.systemPrompt);
    setUserPrompt(prompt.active.userPrompt);
  }, [prompt?.id, prompt?.activeVersion]);

  const dirty =
    Boolean(prompt) && (systemPrompt !== prompt!.active.systemPrompt || userPrompt !== prompt!.active.userPrompt);

  const save = async () => {
    if (!prompt) return;
    setSaving(true);

    try {
      const updated = await api.post<Prompt>(`/api/prompts/${prompt.key}/versions`, {
        note: 'Edited',
        systemPrompt,
        userPrompt,
      });
      await mutate(updated, false);
      toast.success('Saved', 'The next run will use it.');
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!prompt) return;
    try {
      const updated = await api.post<Prompt>(`/api/prompts/${prompt.key}/restore`);
      await mutate(updated, false);
      toast.success('Original restored');
    } catch (err) {
      toast.error('Could not restore', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const duplicate = async () => {
    if (!prompt) return;
    try {
      const copy = await api.post<Prompt>(`/api/prompts/${prompt.key}/duplicate`);
      router.push(`/prompts/${copy.key}`);
    } catch (err) {
      toast.error('Could not duplicate', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  const remove = async () => {
    if (!prompt) return;
    try {
      await api.delete(`/api/prompts/${prompt.key}`);
      toast.success('Deleted', prompt.name);
      router.push('/prompts');
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : 'Unexpected error');
    }
  };

  if (error) {
    return (
      <PageBody>
        <ErrorBlock error={error} onRetry={() => mutate()} />
      </PageBody>
    );
  }

  if (isLoading || !prompt) {
    return (
      <PageBody>
        <Panel>
          <LoadingBlock label="Loading prompt" />
        </Panel>
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/prompts', label: 'Prompts' },
          { href: `/prompts/${prompt.key}`, label: prompt.name },
        ]}
        title={prompt.name}
        description={prompt.description}
        action={
          <>
            <Button variant="ghost" onClick={duplicate}>
              <Copy />
              Duplicate
            </Button>
            {prompt.isBuiltIn ? (
              <Button variant="ghost" onClick={restore}>
                <RotateCcw />
                Restore original
              </Button>
            ) : (
              <Button variant="dangerGhost" onClick={remove}>
                <Trash2 />
                Delete
              </Button>
            )}
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
              <Save />
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
          </>
        }
      />

      <PageBody>
        <Panel className="max-w-4xl space-y-6 p-5">
          <Field
            label="Instructions"
            hint="The role and the rules the model works under."
            aside={`${formatNumber(systemPrompt.length)} characters`}
          >
            {({ id }) => (
              <Textarea
                id={id}
                rows={14}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                className="font-[family-name:var(--font-mono)] text-xs leading-relaxed"
              />
            )}
          </Field>

          <Field
            label="The task"
            hint="Use {{double braces}} to drop in the applicant, the target, or an earlier step."
            aside={`${formatNumber(userPrompt.length)} characters`}
          >
            {({ id }) => (
              <Textarea
                id={id}
                rows={20}
                value={userPrompt}
                onChange={(event) => setUserPrompt(event.target.value)}
                className="font-[family-name:var(--font-mono)] text-xs leading-relaxed"
              />
            )}
          </Field>
        </Panel>
      </PageBody>
    </>
  );
}
