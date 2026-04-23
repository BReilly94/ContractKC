import { asBrandedId } from '@ckb/shared';
import { describe, expect, it } from 'vitest';
import { decideAccess } from './access.js';
import type { UserId } from './ids.js';

const alice = asBrandedId<'User'>('01HXTESTUSER0000000000ALICE');
const bob = asBrandedId<'User'>('01HXTESTUSER000000000000BOB');

function userId(raw: string): UserId {
  return asBrandedId<'User'>(raw);
}

describe('decideAccess — revocation precedence (security.md §3)', () => {
  it('allows when user has a grant and no revocation', () => {
    const decision = decideAccess({
      revocations: [],
      grants: [{ userId: alice, contractRole: 'Owner' }],
      subjectUserId: alice,
    });
    expect(decision).toEqual({ allow: true, role: 'Owner' });
  });

  it('denies when user has no grant', () => {
    const decision = decideAccess({
      revocations: [],
      grants: [{ userId: bob, contractRole: 'Viewer' }],
      subjectUserId: alice,
    });
    expect(decision).toEqual({ allow: false, reason: 'NoGrant' });
  });

  it('denies when user is revoked even if they have a grant', () => {
    const decision = decideAccess({
      revocations: [{ userId: alice, reversedAt: null }],
      grants: [{ userId: alice, contractRole: 'Owner' }],
      subjectUserId: alice,
    });
    expect(decision).toEqual({ allow: false, reason: 'Revoked' });
  });

  it('honors a reversed revocation (treats it as no longer active)', () => {
    const decision = decideAccess({
      revocations: [{ userId: alice, reversedAt: new Date('2026-04-21') }],
      grants: [{ userId: alice, contractRole: 'Owner' }],
      subjectUserId: alice,
    });
    expect(decision).toEqual({ allow: true, role: 'Owner' });
  });

  it('default-denies users with neither grant nor revocation', () => {
    const decision = decideAccess({
      revocations: [],
      grants: [],
      subjectUserId: userId('01HXTESTUSER000000000STRNGR'),
    });
    expect(decision.allow).toBe(false);
  });
});
