import { describe, expect, it } from 'vitest';
import { extractCitations, verifyCitations } from './citations.js';

describe('extractCitations', () => {
  it('parses single-chunk citations', () => {
    const citations = extractCitations('The contract requires X [cite:chunk-1].');
    expect(citations).toHaveLength(1);
    expect(citations[0]?.chunkIds).toEqual(['chunk-1']);
  });

  it('parses multi-chunk citations', () => {
    const citations = extractCitations('Y is supported [cite:chunk-1,chunk-2,chunk-3].');
    expect(citations[0]?.chunkIds).toEqual(['chunk-1', 'chunk-2', 'chunk-3']);
  });

  it('handles refusal marker', () => {
    const citations = extractCitations('[cite:none]');
    expect(citations[0]?.chunkIds).toEqual(['none']);
  });
});

describe('verifyCitations (Non-Negotiable #1)', () => {
  it('passes a well-cited response', () => {
    const result = verifyCitations({
      responseText: 'Clause 14.2 requires notice [cite:chunk-1]. The period is 14 days [cite:chunk-2].',
      retrievedChunkIds: ['chunk-1', 'chunk-2', 'chunk-3'],
    });
    expect(result.ok).toBe(true);
  });

  it('fails when a response cites an unknown chunk', () => {
    const result = verifyCitations({
      responseText: 'Clause 14.2 requires notice [cite:chunk-999].',
      retrievedChunkIds: ['chunk-1'],
    });
    expect(result.ok).toBe(false);
    expect(result.unknownChunkIds).toContain('chunk-999');
  });

  it('fails when a factual sentence has no citation', () => {
    const result = verifyCitations({
      responseText: 'Clause 14.2 requires notice. This is an uncited claim.',
      retrievedChunkIds: ['chunk-1'],
    });
    expect(result.ok).toBe(false);
    expect(result.uncitedSentenceCount).toBeGreaterThan(0);
  });

  it('passes an explicit refusal with cite:none', () => {
    const result = verifyCitations({
      responseText: '[cite:none]',
      retrievedChunkIds: ['chunk-1'],
    });
    expect(result.ok).toBe(true);
  });

  it('passes a refusal that uses the standard preamble', () => {
    const result = verifyCitations({
      responseText: 'The contract does not appear to address this topic.',
      retrievedChunkIds: [],
    });
    expect(result.ok).toBe(true);
  });

  it('fails on a mix of cited + uncited sentences', () => {
    const result = verifyCitations({
      responseText:
        'Clause 14.2 requires notice [cite:chunk-1]. However, there is no stated grace period.',
      retrievedChunkIds: ['chunk-1'],
    });
    expect(result.ok).toBe(false);
  });
});
