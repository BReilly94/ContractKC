import { describe, expect, it } from 'vitest';
import { canonicalEncoding, computeRowHash, type HashableRow } from './hash-chain.js';

const baseRow: HashableRow = {
  id: '01HXAUDITROW00000000000AAAA',
  actorUserId: '01HXTESTUSER0000000000BRIAN',
  action: 'contract.create',
  entityType: 'Contract',
  entityId: '01HXCONTRACT000000000000CC',
  beforeJson: null,
  afterJson: '{"name":"Red Lake Expansion"}',
  correlationId: '01HXCORR000000000000000ABCX',
  createdAt: new Date('2026-04-21T10:00:00.000Z'),
  prevHash: null,
};

describe('computeRowHash', () => {
  it('produces a stable 64-char hex hash', () => {
    const hash = computeRowHash(baseRow);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic across calls', () => {
    const a = computeRowHash(baseRow);
    const b = computeRowHash(baseRow);
    expect(a).toBe(b);
  });

  it('changes when any field changes', () => {
    const baseline = computeRowHash(baseRow);
    expect(computeRowHash({ ...baseRow, id: '01HXDIFFERENTIDXXXXXXXXXXXX' })).not.toBe(baseline);
    expect(computeRowHash({ ...baseRow, action: 'contract.update' })).not.toBe(baseline);
    expect(computeRowHash({ ...baseRow, entityId: 'OTHER' })).not.toBe(baseline);
    expect(computeRowHash({ ...baseRow, afterJson: '{"name":"Other"}' })).not.toBe(baseline);
    expect(
      computeRowHash({ ...baseRow, createdAt: new Date('2026-04-21T10:00:00.001Z') }),
    ).not.toBe(baseline);
  });

  it('chains via prevHash (changing prevHash changes rowHash)', () => {
    const first = computeRowHash(baseRow);
    const second = computeRowHash({ ...baseRow, prevHash: first });
    const third = computeRowHash({ ...baseRow, prevHash: 'a'.repeat(64) });
    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
  });
});

describe('canonicalEncoding', () => {
  it('emits ISO date strings', () => {
    expect(canonicalEncoding(baseRow)).toContain('"createdAt":"2026-04-21T10:00:00.000Z"');
  });

  it('preserves null for absent before/prev', () => {
    expect(canonicalEncoding(baseRow)).toContain('"beforeJson":null');
    expect(canonicalEncoding(baseRow)).toContain('"prevHash":null');
  });
});
