import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { resolveModelConfig } from '@flow/shared';

/**
 * The only server-side code in the deployed app, and the only place a model is
 * called.
 *
 * It is deliberately stateless and amnesiac. The caller supplies the prompt,
 * the model config, and — critically — their own API key. This route does not
 * read `process.env.OPENAI_API_KEY`, does not write the key anywhere, does not
 * log it, and does not return it. Whoever deploys this app cannot use it to
 * spend a visitor's credit, and a visitor cannot spend the operator's.
 *
 * That is enforced below by never referencing an environment key at all: there
 * is no fallback to remove later, and no configuration that could reintroduce
 * one by accident.
 */

export const runtime = 'nodejs';

/**
 * Web-search research legitimately runs for minutes. Vercel caps this by plan
 * (60s on Hobby, up to 300s with Fluid compute), and exceeding it surfaces as
 * a 504, so the message below explains what to change rather than just failing.
 */
export const maxDuration = 300;

interface ExecuteBody {
  apiKey?: string;
  demoMode?: boolean;
  step?: {
    key?: string;
    title?: string;
    systemPrompt?: string;
    userPrompt?: string;
    outputSchema?: Record<string, unknown> | null;
    config?: {
      model?: string;
      temperature?: number | null;
      reasoningEffort?: string | null;
      maxOutputTokens?: number | null;
      webSearch?: boolean;
    };
  };
}

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/** Pulls text out of a Responses API result across model families. */
function readText(response: unknown): string {
  const value = response as Record<string, unknown>;

  if (typeof value?.output_text === 'string' && value.output_text.trim()) return value.output_text;

  const chunks: string[] = [];
  for (const item of (value?.output as { content?: { text?: string }[] }[]) ?? []) {
    for (const part of item?.content ?? []) {
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  if (chunks.length) return chunks.join('\n');

  const legacy = (value?.choices as { message?: { content?: string } }[])?.[0]?.message?.content;
  return typeof legacy === 'string' ? legacy : '';
}

function parseJsonOutput(text: string): unknown {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  if (!cleaned) throw new Error('The model returned an empty response.');

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error(
      'The model did not return valid JSON. Try lowering the temperature, or simplify the output schema on this prompt.',
    );
  }
}

/** Turns an SDK error into something the person can act on. */
function describeError(error: unknown, model: string): { message: string; status: number } {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : 'The model call failed.';

  if (status === 401) return { message: 'OpenAI rejected that API key. Check it under Settings, or paste a new one.', status: 401 };
  if (status === 403) return { message: `Your key cannot reach "${model}". Pick a different model under Settings.`, status: 403 };
  if (status === 404) return { message: `Model "${model}" does not exist, or your account has no access to it.`, status: 404 };
  if (status === 429) {
    // Two different problems share this status. Being out of credit is by far
    // the more common one, and "lower your concurrency" is useless advice for
    // it, so the two are told apart.
    const detail = (error as { error?: { code?: string; type?: string } })?.error;
    const outOfCredit =
      detail?.code === 'credit_balance_exhausted' ||
      detail?.type === 'insufficient_quota' ||
      /quota|credit|billing/i.test(message);

    if (outOfCredit) {
      return {
        message:
          'Your OpenAI account has no credit left. Add credit at platform.openai.com/settings/organization/billing, then run again.',
        status: 429,
      };
    }

    return { message: 'OpenAI rate-limited this request. Lower the concurrency in the run options and try again.', status: 429 };
  }
  if (status === 400 && /temperature/i.test(message)) {
    // Should be unreachable: temperature is no longer sent. If it happens, the
    // request did not go through resolveModelConfig, so say that rather than
    // pointing at a field the interface no longer has.
    return { message: `Model "${model}" rejected a parameter this app should not be sending. Please report this.`, status: 400 };
  }
  if (typeof status === 'number' && status >= 500) {
    return { message: 'OpenAI is having trouble right now. This target can be retried in a moment.', status: 502 };
  }

  return { message, status: typeof status === 'number' ? status : 502 };
}

export async function POST(request: Request) {
  const started = Date.now();

  let body: ExecuteBody;
  try {
    body = (await request.json()) as ExecuteBody;
  } catch {
    return fail('The request body was not valid JSON.', 400);
  }

  const step = body.step;
  if (!step?.userPrompt?.trim()) {
    return fail(`Step "${step?.title ?? step?.key ?? 'unknown'}" has an empty prompt. Open it in the Prompt studio and add one.`, 422);
  }

  // Decided from code, never from the request. A workspace stored before the
  // model settings were fixed still holds the old values, and honouring them
  // is how a run ends up sending a parameter the model rejects.
  const config = resolveModelConfig(step.config);

  // Demo output is produced in the browser, so reaching here without a key
  // means the caller genuinely intended a live call and has none.
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return fail(
      'No API key was supplied. Open Settings and add your own OpenAI key — this app never uses a key belonging to whoever deployed it.',
      401,
    );
  }

  const client = new OpenAI({ apiKey, maxRetries: 1 });

  const payload: Record<string, unknown> = {
    model: config.model,
    input: step.systemPrompt?.trim()
      ? [
          { role: 'system', content: step.systemPrompt },
          { role: 'user', content: step.userPrompt },
        ]
      : step.userPrompt,
  };

  // Reasoning models reject an explicit temperature, so only send one when set.
  if (typeof config.temperature === 'number') payload.temperature = config.temperature;
  if (config.reasoningEffort) payload.reasoning = { effort: config.reasoningEffort };
  if (config.maxOutputTokens) payload.max_output_tokens = config.maxOutputTokens;
  if (config.webSearch) payload.tools = [{ type: 'web_search_preview' }];

  if (step.outputSchema) {
    payload.text = {
      format: {
        type: 'json_schema',
        name: String(step.key ?? 'structured_output').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60) || 'structured_output',
        strict: true,
        schema: step.outputSchema,
      },
    };
  }

  try {
    const response = await client.responses.create(payload as never);
    const text = readText(response);
    const output = step.outputSchema ? parseJsonOutput(text) : text;

    const usage = (response as { usage?: Record<string, number & Record<string, number>> }).usage ?? {};
    const promptTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
    const completionTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
    const reasoningTokens = Number(
      (usage.output_tokens_details as unknown as { reasoning_tokens?: number })?.reasoning_tokens ??
        (usage.completion_tokens_details as unknown as { reasoning_tokens?: number })?.reasoning_tokens ??
        0,
    );

    return NextResponse.json({
      success: true,
      data: {
        stepKey: step.key,
        output,
        engine: 'live',
        usage: {
          promptTokens,
          // Reasoning tokens are reported inside output tokens; separating them
          // is what makes an unexpectedly large bill explainable.
          completionTokens: Math.max(0, completionTokens - reasoningTokens),
          reasoningTokens,
          totalTokens: Number(usage.total_tokens ?? promptTokens + completionTokens),
          model: config.model,
        },
        durationMs: Date.now() - started,
      },
    });
  } catch (error) {
    const { message, status } = describeError(error, config.model);
    // Nothing about the key is logged, here or anywhere else in this route.
    return fail(message, status);
  }
}
