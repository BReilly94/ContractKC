import { describe, expect, it } from 'vitest';
import { contentAddressedPath, isSha256Hex, sha256 } from './hash.js';

describe('hash', () => {
  it('produces deterministic 64-char hex', () => {
    const hash = sha256('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256('hello world')).toBe(hash);
  });

  it('builds content-addressed paths', () => {
    const hash = sha256('abc');
    expect(contentAddressedPath(hash)).toBe(`sha256/${hash}`);
    expect(contentAddressedPath(hash, 'raw.eml')).toBe(`sha256/${hash}/raw.eml`);
  });

  it('rejects invalid hashes', () => {
    expect(() => contentAddressedPath('not-a-hash')).toThrow();
  });

  it('type-guards SHA-256 hex', () => {
    expect(isSha256Hex(sha256('x'))).toBe(true);
    expect(isSha256Hex('zz')).toBe(false);
  });
});
