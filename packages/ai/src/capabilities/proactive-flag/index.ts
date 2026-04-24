import { verifyCitations, type VerifyResult } from '../../citations.js';
import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  PROACTIVE_FLAG_FIRST_PASS_OWNER,
  PROACTIVE_FLAG_FIRST_PASS_PROMPT_VERSION,
  proactiveFlagFirstPassPrompt,
} from './first-pass.js';
import {
  PROACTIVE_FLAG_DEEP_REVIEW_OWNER,
  PROACTIVE_FLAG_DEEP_REVIEW_PROMPT_VERSION,
  proactiveFlagDeepReviewPrompt,
} from './deep-review.js';
import {
  ProactiveFlagDeepReviewInputSchema,
  ProactiveFlagDeepReviewOutputSchema,
  ProactiveFlagFirstPassInputSchema,
  ProactiveFlagFirstPassOutputSchema,
  type ProactiveFlagDeepReviewInputT,
  type ProactiveFlagDeepReviewOutputT,
  type ProactiveFlagFirstPassInputT,
  type ProactiveFlagFirstPassOutputT,
} from './schema.js';

export interface ProactiveFlagFirstPassResult {
  readonly output: ProactiveFlagFirstPassOutputT;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
  readonly model: string;
}

/**
 * First-pass classifier. Cheap, tight context, Sonnet. Deciding whether
 * the event is worth a deep review (§7.10 cost control).
 */
export async function runProactiveFlagFirstPass(
  llm: LLMClient,
  input: ProactiveFlagFirstPassInputT,
): Promise<ProactiveFlagFirstPassResult> {
  const validated = ProactiveFlagFirstPassInputSchema.parse(input);
  const { system, user } = proactiveFlagFirstPassPrompt(validated);

  const resp = await llm.complete({
    capability: 'proactive-flag-first-pass',
    promptVersion: PROACTIVE_FLAG_FIRST_PASS_PROMPT_VERSION,
    model: modelFor('proactive-flag-first-pass'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 512,
    responseFormat: 'json',
  });

  const trimmed = resp.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  const parsed = JSON.parse(trimmed) as unknown;
  const output = ProactiveFlagFirstPassOutputSchema.parse(parsed);

  return {
    output,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: PROACTIVE_FLAG_FIRST_PASS_PROMPT_VERSION,
    owner: PROACTIVE_FLAG_FIRST_PASS_OWNER,
    model: resp.modelActual,
  };
}

export interface ProactiveFlagDeepReviewResult {
  readonly output: ProactiveFlagDeepReviewOutputT;
  readonly verification: VerifyResult;
  /** True when the flag passed first-pass + deep-review + citation verification. */
  readonly raised: boolean;
  readonly blockedReason: string | null;
  readonly citedChunkIds: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
  readonly model: string;
}

/**
 * Deep-review. Opus + full retrieval context + mandatory citations.
 *
 * Every produced flag has its reasoning run through the citation verifier
 * (Non-Negotiable #1). Flags that fail verification are NOT surfaced to
 * users — the caller is expected to log them as AI quality incidents.
 */
export async function runProactiveFlagDeepReview(
  llm: LLMClient,
  input: ProactiveFlagDeepReviewInputT,
): Promise<ProactiveFlagDeepReviewResult> {
  const validated = ProactiveFlagDeepReviewInputSchema.parse(input);
  const { system, user } = proactiveFlagDeepReviewPrompt(validated);

  const resp = await llm.complete({
    capability: 'proactive-flag-deep-review',
    promptVersion: PROACTIVE_FLAG_DEEP_REVIEW_PROMPT_VERSION,
    model: modelFor('proactive-flag-deep-review'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 2048,
    responseFormat: 'json',
  });

  const trimmed = resp.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  const parsed = JSON.parse(trimmed) as unknown;
  const output = ProactiveFlagDeepReviewOutputSchema.parse(parsed);

  // Non-Negotiable #1 — verify that reasoning citations reference the
  // retrieved chunk set. We only verify when the model chose to raise;
  // a `raise: false` response has no factual claims to cite.
  const retrievedIds = validated.chunks.map((c) => c.chunkId);
  const verification: VerifyResult = output.raise
    ? verifyCitations({
        responseText: output.reasoning,
        retrievedChunkIds: retrievedIds,
      })
    : { ok: true, citations: [], unknownChunkIds: [], uncitedSentenceCount: 0 };

  const raised = output.raise && verification.ok;

  // Only surface citation ids that are actually in the retrieval set.
  const seen = new Set(retrievedIds);
  const citedChunkIds = [
    ...new Set(output.citedChunkIds.filter((id) => seen.has(id))),
  ];

  return {
    output,
    verification,
    raised,
    blockedReason: output.raise && !verification.ok ? (verification.reason ?? null) : null,
    citedChunkIds,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: PROACTIVE_FLAG_DEEP_REVIEW_PROMPT_VERSION,
    owner: PROACTIVE_FLAG_DEEP_REVIEW_OWNER,
    model: resp.modelActual,
  };
}

export {
  ProactiveFlagDeepReviewInputSchema,
  ProactiveFlagDeepReviewOutputSchema,
  ProactiveFlagFirstPassInputSchema,
  ProactiveFlagFirstPassOutputSchema,
};
export type {
  ProactiveFlagDeepReviewInputT,
  ProactiveFlagDeepReviewOutputT,
  ProactiveFlagFirstPassInputT,
  ProactiveFlagFirstPassOutputT,
} from './schema.js';
