import 'dotenv/config';
import { createExecutorService } from '@flow/llm/executor';

/**
 * Outreach stage.
 *
 * Defaults to the strongest writing model, because this is the only stage whose
 * output a human actually reads and sends.
 */
createExecutorService({
  name: 'outreach',
  port: process.env.OUTREACH_PORT ?? 4006,
  defaultModel: process.env.FLOW_OUTREACH_MODEL ?? 'gpt-5.1',
  description: 'Writes and reviews the message that gets sent.',
});
