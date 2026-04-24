import { describe, expect, it } from 'vitest';
import { createErpClient, ErpManualFallbackRequiresPostError } from './index.js';

describe('erp manual fallback', () => {
  it('defaults to manual when no source system is configured', () => {
    const client = createErpClient();
    expect(client.sourceSystem).toBe('Manual');
  });

  it('ping always returns true for manual mode (no upstream)', async () => {
    const client = createErpClient();
    await expect(client.ping()).resolves.toBe(true);
  });

  it('fetchContractSnapshot throws ErpManualFallbackRequiresPostError', async () => {
    const client = createErpClient();
    await expect(client.fetchContractSnapshot('01HXCONTRACT0000000000000X')).rejects.toBeInstanceOf(
      ErpManualFallbackRequiresPostError,
    );
  });
});
