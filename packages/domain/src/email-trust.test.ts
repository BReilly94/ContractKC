import { asBrandedId } from '@ckb/shared';
import { describe, expect, it } from 'vitest';
import { normalizeSubject, resolveSenderTrust, type SenderTrustEntry } from './email.js';
import type { ContractId, SenderTrustEntryId, UserId } from './ids.js';

const CONTRACT = asBrandedId<'Contract'>('01HXCONTRACT000000000000AA');
const OTHER_CONTRACT = asBrandedId<'Contract'>('01HXCONTRACT0000000000000B');
const USER = asBrandedId<'User'>('01HXUSER0000000000000000AA');

function entry(
  overrides: Partial<SenderTrustEntry> & Pick<SenderTrustEntry, 'matchType' | 'matchValue' | 'trustState'>,
): SenderTrustEntry {
  return {
    id: asBrandedId<'SenderTrustEntry'>('01HXSTE000000000000000000A') as SenderTrustEntryId,
    contractId: null,
    addedByUserId: USER as UserId,
    addedAt: new Date(),
    reason: null,
    ...overrides,
  };
}

describe('resolveSenderTrust', () => {
  it('defaults to ReviewQueue when no entries match', () => {
    expect(resolveSenderTrust('client@acme.com', [], CONTRACT)).toBe('ReviewQueue');
  });

  it('respects a contract-scoped exact-address approval', () => {
    const entries = [
      entry({ contractId: CONTRACT, matchType: 'ExactAddress', matchValue: 'client@acme.com', trustState: 'Approved' }),
    ];
    expect(resolveSenderTrust('client@acme.com', entries, CONTRACT)).toBe('Approved');
  });

  it('contract-scoped exact beats global domain deny', () => {
    const entries = [
      entry({ contractId: null, matchType: 'Domain', matchValue: 'acme.com', trustState: 'Denied' }),
      entry({ contractId: CONTRACT, matchType: 'ExactAddress', matchValue: 'client@acme.com', trustState: 'Approved' }),
    ];
    expect(resolveSenderTrust('client@acme.com', entries, CONTRACT)).toBe('Approved');
  });

  it('ignores other contracts entries', () => {
    const entries = [
      entry({ contractId: OTHER_CONTRACT, matchType: 'ExactAddress', matchValue: 'client@acme.com', trustState: 'Approved' }),
    ];
    expect(resolveSenderTrust('client@acme.com', entries, CONTRACT)).toBe('ReviewQueue');
  });

  it('global domain denial → Unapproved', () => {
    const entries = [entry({ matchType: 'Domain', matchValue: 'spam.example', trustState: 'Denied' })];
    expect(resolveSenderTrust('bot@spam.example', entries, CONTRACT)).toBe('Unapproved');
  });
});

describe('normalizeSubject', () => {
  it('strips Re: / Fw: / Fwd: prefixes', () => {
    expect(normalizeSubject('Re: Fw: RFI-017 cable tray')).toBe('rfi-017 cable tray');
  });

  it('strips ticket-style bracket tags', () => {
    expect(normalizeSubject('[Project Redlake] RFI-017 cable tray')).toBe('rfi-017 cable tray');
  });

  it('handles mixed prefixes + tags', () => {
    expect(normalizeSubject('Re: [INTERNAL] Fwd: [Project] RFI-017')).toBe('rfi-017');
  });
});
