import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  deadlineExtractPrompt,
  DEADLINE_EXTRACT_OWNER,
  DEADLINE_EXTRACT_PROMPT_VERSION,
} from './prompt.js';
import {
  DeadlineExtractInputSchema,
  DeadlineExtractOutputSchema,
  type DeadlineExtractInputT,
  type DeadlineExtractOutputT,
} from './schema.js';

export interface DeadlineExtractResult {
  readonly output: DeadlineExtractOutputT;
  readonly citedChunkIds: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
}

export async function runDeadlineExtract(
  llm: LLMClient,
  input: DeadlineExtractInputT,
): Promise<DeadlineExtractResult> {
  const validated = DeadlineExtractInputSchema.parse(input);
  const { system, user } = deadlineExtractPrompt(validated);

  const resp = await llm.complete({
    capability: 'deadline-extract',
    promptVersion: DEADLINE_EXTRACT_PROMPT_VERSION,
    model: modelFor('deadline-extract'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 2048,
    responseFormat: 'json',
  });

  const trimmed = resp.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  const parsed = JSON.parse(trimmed) as unknown;
  const output = DeadlineExtractOutputSchema.parse(parsed);

  return {
    output,
    citedChunkIds: [...new Set(output.obligations.map((o) => o.citation))],
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: DEADLINE_EXTRACT_PROMPT_VERSION,
    owner: DEADLINE_EXTRACT_OWNER,
  };
}

export { DeadlineExtractInputSchema, DeadlineExtractOutputSchema };
export type { DeadlineExtractInputT, DeadlineExtractOutputT, ObligationT } from './schema.js';
