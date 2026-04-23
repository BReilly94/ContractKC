import { verifyCitations, type VerifyResult } from '../../citations.js';
import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  qaSynthPrompt,
  QA_SYNTH_OWNER,
  QA_SYNTH_PROMPT_VERSION,
} from './prompt.js';
import { QaSynthInputSchema, type QaSynthInputT } from './schema.js';

export interface QaSynthResult {
  readonly answer: string;
  readonly verification: VerifyResult;
  /** True when the response was withheld (verification failed). */
  readonly blocked: boolean;
  readonly blockedReason: string | null;
  readonly citedChunkIds: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
}

/**
 * Run the Q&A synthesis capability. Post-generation citation verification
 * is hard-enforced here — responses that fail verification are withheld
 * and a user-facing "citation check failed" block is returned. This is the
 * API-boundary enforcement of Non-Negotiable #1.
 */
export async function runQaSynth(
  llm: LLMClient,
  input: QaSynthInputT,
): Promise<QaSynthResult> {
  const validated = QaSynthInputSchema.parse(input);
  const { system, user } = qaSynthPrompt(validated);

  const resp = await llm.complete({
    capability: 'qa-synth',
    promptVersion: QA_SYNTH_PROMPT_VERSION,
    model: modelFor('qa-synth'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 2048,
    responseFormat: 'text',
  });

  const retrievedIds = validated.chunks.map((c) => c.chunkId);
  const verification = verifyCitations({
    responseText: resp.text,
    retrievedChunkIds: retrievedIds,
  });

  const blocked = !verification.ok;
  const answer = blocked
    ? 'Response withheld — citation check failed. An AI quality incident has been logged.'
    : resp.text;

  const citedChunkIds = [
    ...new Set(
      verification.citations.flatMap((c) =>
        c.chunkIds.filter((id) => id !== 'none' && retrievedIds.includes(id)),
      ),
    ),
  ];

  return {
    answer,
    verification,
    blocked,
    blockedReason: verification.reason ?? null,
    citedChunkIds,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: QA_SYNTH_PROMPT_VERSION,
    owner: QA_SYNTH_OWNER,
  };
}

export { QaSynthInputSchema };
export type { QaSynthInputT } from './schema.js';
