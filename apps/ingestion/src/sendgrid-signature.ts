import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * SendGrid Inbound Parse signs the raw webhook body with an ECDSA key per
 * event-webhook, but Inbound Parse itself does NOT come with a built-in
 * signature. Common hardening is to sign the path with a shared HMAC in the
 * configured webhook URL or behind a gateway.
 *
 * This helper supports an HMAC-SHA256 mode over the raw body, toggled by
 * presence of `INGESTION_WEBHOOK_SECRET`. If the secret is unset, the
 * webhook MUST fail closed — we never accept unauthenticated mail in any
 * non-local environment.
 */
export function verifyHmacSha256(rawBody: Buffer, secret: string, signatureHex: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const got = Buffer.from(signatureHex, 'hex');
  if (got.length !== expected.length) return false;
  return timingSafeEqual(expected, got);
}
