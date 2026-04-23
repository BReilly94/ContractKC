import type { User } from '@ckb/domain';
import { asBrandedId } from '@ckb/shared';
import { describe, expect, it } from 'vitest';
import { DevAuthProvider } from './dev-impl.js';

function testUser(id: string, overrides: Partial<User> = {}): User {
  return {
    id: asBrandedId<'User'>(id),
    email: `${id}@test.local`,
    displayName: id,
    globalRole: 'Standard',
    isPm: false,
    canCreateContracts: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('DevAuthProvider', () => {
  const dana = testUser('01HXTESTUSER0000000000DANAA', { isPm: true });
  const sam = testUser('01HXTESTUSER0000000000SAMMM');
  const provider = new DevAuthProvider({
    signingSecret: 'local-dev-only-secret-value-16plus',
    users: [dana, sam],
  });

  it('issues and verifies dev tokens', async () => {
    const token = await provider.issueDevToken(dana.id);
    const principal = await provider.verifyToken(token);
    expect(principal?.userId).toBe(dana.id);
    expect(principal?.user.email).toBe(dana.email);
  });

  it('rejects bogus tokens', async () => {
    expect(await provider.verifyToken('not-a-token')).toBeNull();
    expect(await provider.verifyToken('')).toBeNull();
  });

  it('rejects tokens signed with a different secret', async () => {
    const other = new DevAuthProvider({
      signingSecret: 'different-16plus-char-secret-abc',
      users: [dana],
    });
    const token = await other.issueDevToken(dana.id);
    expect(await provider.verifyToken(token)).toBeNull();
  });

  it('rejects tokens for unknown users', async () => {
    await expect(
      provider.issueDevToken(asBrandedId<'User'>('01HXUNKNOWN00000000000000X')),
    ).rejects.toThrow();
  });

  it('requires a non-trivial signing secret (fails closed per security.md §8)', () => {
    expect(() => new DevAuthProvider({ signingSecret: 'short', users: [dana] })).toThrow();
  });

  it('listDevUsers returns all seeded users', async () => {
    const users = await provider.listDevUsers();
    expect(users.map((u) => u.id).sort()).toEqual([dana.id, sam.id].sort());
  });
});
