import { describe, expect, it } from 'vitest';
import { asBrandedId } from '@ckb/shared';
import {
  isDigestDue,
  resolveEffectivePreference,
  type DigestPreference,
} from './digest-preference.js';

function pref(overrides: Partial<DigestPreference>): DigestPreference {
  return {
    id: asBrandedId<'DigestPreference'>('01HXTESTDIGESTPREF00000001'),
    userId: asBrandedId<'User'>('01HXTESTUSER000000000000001'),
    contractId: null,
    frequency: 'Daily',
    channels: ['InApp'],
    categories: ['upcoming_deadlines'],
    lastDispatchedAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

describe('resolveEffectivePreference', () => {
  it('prefers a contract-specific row over a scope-wide row', () => {
    const contractId = asBrandedId<'Contract'>('01HXTESTCONTRACT0000000001');
    const wide = pref({ contractId: null, frequency: 'Weekly' });
    const specific = pref({
      id: asBrandedId<'DigestPreference'>('01HXTESTDIGESTPREF00000002'),
      contractId,
      frequency: 'Daily',
    });
    const resolved = resolveEffectivePreference([wide, specific], contractId);
    expect(resolved?.id).toBe(specific.id);
    expect(resolved?.frequency).toBe('Daily');
  });

  it('falls back to the scope-wide row when no specific match exists', () => {
    const wide = pref({ contractId: null, frequency: 'Weekly' });
    const resolved = resolveEffectivePreference([wide], 'someOtherContractId');
    expect(resolved?.id).toBe(wide.id);
  });

  it('returns null when no preference applies', () => {
    expect(resolveEffectivePreference([], 'someContractId')).toBeNull();
  });
});

describe('isDigestDue', () => {
  it('is always due when never dispatched', () => {
    expect(isDigestDue(pref({ frequency: 'Daily', lastDispatchedAt: null }))).toBe(true);
    expect(isDigestDue(pref({ frequency: 'Weekly', lastDispatchedAt: null }))).toBe(true);
  });

  it('is never due when frequency is Off', () => {
    expect(isDigestDue(pref({ frequency: 'Off', lastDispatchedAt: null }))).toBe(false);
  });

  it('is due for Daily when ~24 hours have passed', () => {
    const now = new Date('2026-04-20T12:00:00Z');
    const recent = new Date('2026-04-20T06:00:00Z'); // 6h ago
    const yesterday = new Date('2026-04-19T10:00:00Z'); // ~26h ago
    expect(
      isDigestDue(pref({ frequency: 'Daily', lastDispatchedAt: recent }), now),
    ).toBe(false);
    expect(
      isDigestDue(pref({ frequency: 'Daily', lastDispatchedAt: yesterday }), now),
    ).toBe(true);
  });

  it('is due for Weekly when ~7 days have passed', () => {
    const now = new Date('2026-04-20T12:00:00Z');
    const threeDaysAgo = new Date('2026-04-17T12:00:00Z');
    const eightDaysAgo = new Date('2026-04-12T12:00:00Z');
    expect(
      isDigestDue(pref({ frequency: 'Weekly', lastDispatchedAt: threeDaysAgo }), now),
    ).toBe(false);
    expect(
      isDigestDue(pref({ frequency: 'Weekly', lastDispatchedAt: eightDaysAgo }), now),
    ).toBe(true);
  });
});
