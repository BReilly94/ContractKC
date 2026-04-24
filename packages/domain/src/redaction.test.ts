import { describe, expect, it } from 'vitest';
import {
  applyRedactionsToText,
  chunkIsFullyRedacted,
  type Redaction,
} from './redaction.js';

type ActiveFields = Pick<Redaction, 'spanStart' | 'spanEnd' | 'scope' | 'reversedAt'>;

function span(start: number, end: number): ActiveFields {
  return { spanStart: start, spanEnd: end, scope: 'Passage', reversedAt: null };
}
function reversedSpan(start: number, end: number): ActiveFields {
  return { spanStart: start, spanEnd: end, scope: 'Passage', reversedAt: new Date() };
}

describe('applyRedactionsToText', () => {
  it('returns text unchanged when no redactions', () => {
    expect(applyRedactionsToText('hello world', [])).toBe('hello world');
  });

  it('redacts a single span', () => {
    expect(applyRedactionsToText('hello world', [span(6, 11)])).toBe('hello ███');
  });

  it('redacts multiple non-overlapping spans in order', () => {
    expect(applyRedactionsToText('abcdefghij', [span(2, 4), span(6, 8)])).toBe('ab███ef███ij');
  });

  it('handles overlapping spans by emitting one marker per span range', () => {
    // spans (2,5) and (4,7) overlap; second continues from the first cursor.
    // Behaviour: emit one marker per input span, skipping any already-covered
    // text — so the overlap does not double-redact the same characters, but
    // each span still produces its own marker to keep the record auditable.
    const out = applyRedactionsToText('abcdefghij', [span(2, 5), span(4, 7)]);
    expect(out).toBe('ab██████hij');
  });

  it('skips reversed redactions', () => {
    expect(applyRedactionsToText('abcdefghij', [reversedSpan(2, 5)])).toBe('abcdefghij');
  });

  it('ignores whole-document or page scope overlays (caller decides)', () => {
    const doc: ActiveFields = {
      spanStart: null,
      spanEnd: null,
      scope: 'Document',
      reversedAt: null,
    };
    expect(applyRedactionsToText('abcdefghij', [doc])).toBe('abcdefghij');
  });
});

describe('chunkIsFullyRedacted', () => {
  it('returns true when any active Document-scope redaction exists', () => {
    const r: Pick<Redaction, 'scope' | 'reversedAt'> = { scope: 'Document', reversedAt: null };
    expect(chunkIsFullyRedacted([r])).toBe(true);
  });

  it('returns false when only Passage redactions exist', () => {
    const r: Pick<Redaction, 'scope' | 'reversedAt'> = { scope: 'Passage', reversedAt: null };
    expect(chunkIsFullyRedacted([r])).toBe(false);
  });

  it('ignores reversed Document redactions', () => {
    const r: Pick<Redaction, 'scope' | 'reversedAt'> = {
      scope: 'Document',
      reversedAt: new Date(),
    };
    expect(chunkIsFullyRedacted([r])).toBe(false);
  });
});
