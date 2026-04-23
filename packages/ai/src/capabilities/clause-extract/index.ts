import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  clauseExtractPrompt,
  CLAUSE_EXTRACT_OWNER,
  CLAUSE_EXTRACT_PROMPT_VERSION,
} from './prompt.js';
import {
  ClauseExtractInputSchema,
  ClauseExtractOutputSchema,
  type ClauseExtractInputT,
  type ClauseExtractOutputT,
} from './schema.js';

export interface ClauseExtractResult {
  readonly output: ClauseExtractOutputT;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
}

export async function runClauseExtract(
  llm: LLMClient,
  input: ClauseExtractInputT,
): Promise<ClauseExtractResult> {
  const validated = ClauseExtractInputSchema.parse(input);
  const { system, user } = clauseExtractPrompt(validated);

  const resp = await llm.complete({
    capability: 'clause-extract',
    promptVersion: CLAUSE_EXTRACT_PROMPT_VERSION,
    model: modelFor('clause-extract'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 4096,
    responseFormat: 'json',
  });

  const trimmed = resp.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  const parsed = JSON.parse(trimmed) as unknown;
  const output = ClauseExtractOutputSchema.parse(parsed);

  return {
    output,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: CLAUSE_EXTRACT_PROMPT_VERSION,
    owner: CLAUSE_EXTRACT_OWNER,
  };
}

export { ClauseExtractInputSchema, ClauseExtractOutputSchema };
export type { ClauseExtractInputT, ClauseExtractOutputT, ExtractedClauseT } from './schema.js';
