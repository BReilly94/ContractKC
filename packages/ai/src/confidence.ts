/**
 * Confidence signalling (`.claude/rules/ai-layer.md` §6).
 *
 * Determined from retrieval result count, score distribution, citation
 * coverage, and any model-reported confidence in the structured output.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient_context';

export interface ConfidenceInputs {
  readonly retrievalHits: number;
  readonly topScore: number;
  readonly meanScore: number;
  readonly citedChunkCount: number;
  /** Sentence count in the response that was NOT an explicit refusal. */
  readonly nonRefusalSentences: number;
}

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceLevel {
  if (inputs.retrievalHits === 0) return 'insufficient_context';
  if (inputs.nonRefusalSentences === 0) return 'insufficient_context';

  const coverageRatio =
    inputs.nonRefusalSentences === 0
      ? 0
      : inputs.citedChunkCount / inputs.nonRefusalSentences;

  if (inputs.topScore >= 0.75 && coverageRatio >= 1 && inputs.retrievalHits >= 3) {
    return 'high';
  }
  if (inputs.topScore >= 0.5 && coverageRatio >= 0.75) return 'medium';
  return 'low';
}
