import { createHash } from 'node:crypto';

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

const SHA256_HEX = /^[0-9a-f]{64}$/i;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value);
}

export function contentAddressedPath(hex: string, suffix?: string): string {
  if (!isSha256Hex(hex)) {
    throw new Error(`Invalid SHA-256 hex: ${hex}`);
  }
  const lower = hex.toLowerCase();
  return suffix ? `sha256/${lower}/${suffix}` : `sha256/${lower}`;
}
