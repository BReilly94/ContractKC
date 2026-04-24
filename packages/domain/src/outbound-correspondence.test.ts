import { describe, expect, it } from 'vitest';
import {
  ensureProjectBcc,
  formatSubjectLine,
  parseSubjectLine,
} from './outbound-correspondence.js';

describe('formatSubjectLine', () => {
  it('produces the §6.16 canonical shape', () => {
    const out = formatSubjectLine({
      contractAlias: 'redlake-expansion',
      kind: 'RFI',
      sequence: 17,
      revision: 0,
      brief: 'Dewatering setback requirement',
    });
    expect(out).toBe('[redlake-expansion] RFI-17/R0 — Dewatering setback requirement');
  });
});

describe('parseSubjectLine', () => {
  it('round-trips a canonical subject', () => {
    const subject = '[redlake-expansion] DelayNotice-3/R1 — Weather event March 4–9';
    const parsed = parseSubjectLine(subject);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pieces.kind).toBe('DelayNotice');
    expect(parsed.pieces.sequence).toBe(3);
    expect(parsed.pieces.revision).toBe(1);
    expect(parsed.pieces.brief).toBe('Weather event March 4–9');
  });

  it('rejects a subject missing the required shape', () => {
    const parsed = parseSubjectLine('RFI 17 dewatering');
    expect(parsed.ok).toBe(false);
  });

  it('rejects an unknown correspondence kind', () => {
    const parsed = parseSubjectLine('[alias] SomethingWeird-1/R0 — test');
    expect(parsed.ok).toBe(false);
  });

  it('formatSubjectLine → parseSubjectLine is a round-trip', () => {
    const pieces = {
      contractAlias: 'site-7-south',
      kind: 'VariationRequest' as const,
      sequence: 42,
      revision: 3,
      brief: 'Additional grout lines',
    };
    const parsed = parseSubjectLine(formatSubjectLine(pieces));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pieces).toEqual(pieces);
  });
});

describe('ensureProjectBcc (NN #10)', () => {
  it('adds the project address when absent', () => {
    const out = ensureProjectBcc(
      ['counsel@technica.ca'],
      'contract-1234@contracts.technicamining.com',
    );
    expect(out).toContain('contract-1234@contracts.technicamining.com');
    expect(out).toContain('counsel@technica.ca');
  });

  it('does not duplicate when already present', () => {
    const addr = 'contract-1234@contracts.technicamining.com';
    const out = ensureProjectBcc([addr, 'counsel@technica.ca'], addr);
    expect(out.filter((a) => a === addr)).toHaveLength(1);
  });

  it('matches case-insensitively', () => {
    const addr = 'Contract-1234@contracts.technicamining.com';
    const out = ensureProjectBcc([addr.toLowerCase()], addr);
    expect(out).toHaveLength(1);
  });
});
