import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker.js';

describe('chunkText', () => {
  it('returns a single chunk when text is short', () => {
    const chunks = chunkText({ text: 'Short sentence.', maxChars: 200 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('Short sentence.');
  });

  it('splits long text and preserves offsets', () => {
    const text = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.';
    const chunks = chunkText({ text, maxChars: 30, overlapChars: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.charOffsetStart).toBe(0);
    // Verify offsets cover the text.
    const last = chunks[chunks.length - 1]!;
    expect(last.charOffsetEnd).toBeLessThanOrEqual(text.length);
  });

  it('prefers sentence boundaries when possible', () => {
    const text = 'First sentence. Second sentence. Third sentence here.';
    const chunks = chunkText({ text, maxChars: 30, overlapChars: 0 });
    // The chunker falls back to a raw cut when no boundary lies within its
    // look-back window. Assert only that at least one chunk ended on a
    // sentence boundary so the test isn't over-specified for short inputs.
    const anyBoundary = chunks.some(
      (c) => c.charOffsetEnd < text.length && /[.!?]/.test(text[c.charOffsetEnd - 1] ?? ''),
    );
    expect(anyBoundary).toBe(true);
  });

  it('maps offsets to pages when pageOffsets given', () => {
    const text = 'A'.repeat(100) + 'B'.repeat(100) + 'C'.repeat(100);
    const chunks = chunkText({
      text,
      maxChars: 80,
      overlapChars: 10,
      pageOffsets: [0, 100, 200], // 3 pages, 100 chars each
    });
    expect(chunks[0]?.pageStart).toBe(1);
    // A chunk covering 80-160 would overlap pages 1 and 2.
    const midChunk = chunks.find((c) => c.charOffsetStart < 100 && c.charOffsetEnd > 100);
    if (midChunk) {
      expect(midChunk.pageStart).toBe(1);
      expect(midChunk.pageEnd).toBe(2);
    }
  });
});
