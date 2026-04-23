import { describe, expect, it } from 'vitest';
import { verifyCitations } from './citations.js';
import { LLMZeroRetentionRequired } from './client/interface.js';
import { AnthropicLLMClient } from './client/anthropic.js';

/**
 * Non-Negotiable test matrix (SOW §Section 10 Gate 2). One file per Non-Negotiable
 * that's unit-scope-testable. Full system coverage is in integration +
 * E2E; this is the safety net.
 */

describe('Non-Negotiable #1 — Citations mandatory', () => {
  it('blocks a response with no citations on factual claims', () => {
    const result = verifyCitations({
      responseText: 'Clause 14.2 imposes a 14-day notice period.',
      retrievedChunkIds: ['chunk-1'],
    });
    expect(result.ok).toBe(false);
  });

  it('blocks a response that cites unknown chunks', () => {
    const result = verifyCitations({
      responseText: 'The period is 14 days [cite:chunk-999].',
      retrievedChunkIds: ['chunk-1'],
    });
    expect(result.ok).toBe(false);
    expect(result.unknownChunkIds).toContain('chunk-999');
  });

  it('passes a well-cited response', () => {
    const result = verifyCitations({
      responseText: 'The notice period is 14 days [cite:chunk-1].',
      retrievedChunkIds: ['chunk-1'],
    });
    expect(result.ok).toBe(true);
  });
});

describe('LLMClient zero-retention guard', () => {
  it('refuses to construct when zeroRetention=false (fail-closed)', () => {
    expect(
      () => new AnthropicLLMClient({ apiKey: 'sk-ant-test', zeroRetention: false }),
    ).toThrow(LLMZeroRetentionRequired);
  });

  it('constructs when zeroRetention=true', () => {
    // We don't hit the provider — constructor is side-effect free aside from SDK init.
    const client = new AnthropicLLMClient({ apiKey: 'sk-ant-test', zeroRetention: true });
    expect(client.mode).toBe('real');
  });
});
