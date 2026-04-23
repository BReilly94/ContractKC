import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyHmacSha256 } from './sendgrid-signature.js';

function signPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');
}

describe('verifyHmacSha256', () => {
  it('accepts a correctly-signed payload', () => {
    const body = '{"email":"..."}';
    const sig = signPayload(body, 'shared-secret');
    expect(verifyHmacSha256(Buffer.from(body, 'utf8'), 'shared-secret', sig)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const body = '{"email":"..."}';
    const sig = signPayload(body, 'shared-secret');
    expect(verifyHmacSha256(Buffer.from('{"email":"tampered"}', 'utf8'), 'shared-secret', sig)).toBe(
      false,
    );
  });

  it('rejects a payload signed with the wrong secret', () => {
    const body = '{"email":"..."}';
    const sig = signPayload(body, 'wrong-secret');
    expect(verifyHmacSha256(Buffer.from(body, 'utf8'), 'shared-secret', sig)).toBe(false);
  });

  it('rejects a malformed signature', () => {
    expect(verifyHmacSha256(Buffer.from('body', 'utf8'), 'secret', 'not-hex')).toBe(false);
  });
});
