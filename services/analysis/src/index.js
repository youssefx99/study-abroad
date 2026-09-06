import 'dotenv/config';
import { createExecutorService } from '@flow/llm/executor';

/**
 * Analysis stage.
 *
 * Cheap, fast, and never touches the network beyond the model call. Also the
 * executor for user-defined custom steps, since those are arbitrary reasoning
 * over the context built so far.
 */
createExecutorService({
  name: 'analysis',
  port: process.env.ANALYSIS_PORT ?? 4005,
  defaultModel: process.env.FLOW_ANALYSIS_MODEL ?? 'gpt-5-mini',
  description: 'Judges fit between an applicant and a target, and runs custom steps.',
});
