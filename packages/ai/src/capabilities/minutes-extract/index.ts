import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  minutesExtractPrompt,
  MINUTES_EXTRACT_OWNER,
  MINUTES_EXTRACT_PROMPT_VERSION,
} from './prompt.js';
import {
  MinutesExtractInputSchema,
  MinutesExtractOutputSchema,
  type MinutesExtractInputT,
  type MinutesExtractOutputT,
} from './schema.js';

export interface MinutesExtractResult {
  readonly output: MinutesExtractOutputT;
  readonly citedChunkIds: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
}

export async function runMinutesExtract(
  llm: LLMClient,
  input: MinutesExtractInputT,
): Promise<MinutesExtractResult> {
  const validated = MinutesExtractInputSchema.parse(input);
  const { system, user } = minutesExtractPrompt(validated);

  const resp = await llm.complete({
    capability: 'minutes-extract',
    promptVersion: MINUTES_EXTRACT_PROMPT_VERSION,
    model: modelFor('minutes-extract'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 2048,
    responseFormat: 'json',
  });

  const trimmed = resp.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  const parsed = JSON.parse(trimmed) as unknown;
  const output = MinutesExtractOutputSchema.parse(parsed);

  return {
    output,
    citedChunkIds: [...new Set(output.actionItems.map((a) => a.citation))],
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: MINUTES_EXTRACT_PROMPT_VERSION,
    owner: MINUTES_EXTRACT_OWNER,
  };
}

export { MinutesExtractInputSchema, MinutesExtractOutputSchema };
export type { MinutesExtractInputT, MinutesExtractOutputT, ActionItemT } from './schema.js';
