import { describe, expect, it } from 'vitest';
import { computeConfidence } from './confidence.js';

describe('computeConfidence', () => {
  it('returns insufficient_context with zero hits', () => {
    expect(
      computeConfidence({
        retrievalHits: 0,
        topScore: 0,
        meanScore: 0,
        citedChunkCount: 0,
        nonRefusalSentences: 3,
      }),
    ).toBe('insufficient_context');
  });

  it('returns insufficient_context when response is pure refusal', () => {
    expect(
      computeConfidence({
        retrievalHits: 2,
        topScore: 0.3,
        meanScore: 0.2,
        citedChunkCount: 0,
        nonRefusalSentences: 0,
      }),
    ).toBe('insufficient_context');
  });

  it('returns high with strong retrieval and full citation coverage', () => {
    expect(
      computeConfidence({
        retrievalHits: 5,
        topScore: 0.92,
        meanScore: 0.82,
        citedChunkCount: 3,
        nonRefusalSentences: 3,
      }),
    ).toBe('high');
  });

  it('returns medium with partial coverage', () => {
    expect(
      computeConfidence({
        retrievalHits: 3,
        topScore: 0.6,
        meanScore: 0.5,
        citedChunkCount: 3,
        nonRefusalSentences: 4,
      }),
    ).toBe('medium');
  });

  it('returns low with weak retrieval', () => {
    expect(
      computeConfidence({
        retrievalHits: 1,
        topScore: 0.3,
        meanScore: 0.2,
        citedChunkCount: 1,
        nonRefusalSentences: 2,
      }),
    ).toBe('low');
  });
});
