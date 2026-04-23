import { describe, expect, it } from 'vitest';
import { asBrandedId, isValidUlid, newUlid } from './ids.js';

describe('ids', () => {
  it('generates 26-char ULIDs', () => {
    const id = newUlid();
    expect(id).toHaveLength(26);
    expect(isValidUlid(id)).toBe(true);
  });

  it('ULIDs are sortable by generation time', async () => {
    const a = newUlid();
    await new Promise((r) => setTimeout(r, 2));
    const b = newUlid();
    expect(a < b).toBe(true);
  });

  it('rejects invalid ULIDs', () => {
    expect(isValidUlid('not-a-ulid')).toBe(false);
    expect(isValidUlid('01HZ')).toBe(false);
    // 26 chars but contains I (not in Crockford base32)
    expect(isValidUlid('01HZI00000000000000000000X')).toBe(false);
  });

  it('asBrandedId preserves the string value', () => {
    const raw = newUlid();
    const branded = asBrandedId<'TestKind'>(raw);
    expect(branded).toBe(raw);
  });
});
