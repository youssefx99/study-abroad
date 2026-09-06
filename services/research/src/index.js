import 'dotenv/config';
import { createExecutorService } from '@flow/llm/executor';

/**
 * Research stage.
 *
 * Slowest and least predictable of the three: web search can take minutes, and
 * results vary by how much a target has published. It runs as its own service
 * so a queue of slow research calls never blocks message drafting.
 */
createExecutorService({
  name: 'research',
  port: process.env.RESEARCH_PORT ?? 4004,
  defaultModel: process.env.FLOW_RESEARCH_MODEL ?? 'gpt-5-mini',
  description: 'Gathers verifiable public facts about a target using web search.',
});
