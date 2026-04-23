import { NotSupportedInLocalError } from '@ckb/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AzureKeyVaultProviderStub, EnvSecretsProvider } from './env-impl.js';

describe('EnvSecretsProvider', () => {
  const provider = new EnvSecretsProvider();
  const savedValue = process.env.CKB_TEST_SECRET;

  beforeEach(() => {
    delete process.env.CKB_TEST_SECRET;
  });
  afterEach(() => {
    if (savedValue === undefined) delete process.env.CKB_TEST_SECRET;
    else process.env.CKB_TEST_SECRET = savedValue;
  });

  it('returns undefined for unset keys', async () => {
    expect(await provider.get('CKB_TEST_SECRET')).toBeUndefined();
  });

  it('returns the value when set', async () => {
    process.env.CKB_TEST_SECRET = 'hello';
    expect(await provider.get('CKB_TEST_SECRET')).toBe('hello');
  });

  it('treats empty strings as unset', async () => {
    process.env.CKB_TEST_SECRET = '';
    expect(await provider.get('CKB_TEST_SECRET')).toBeUndefined();
    expect(await provider.has('CKB_TEST_SECRET')).toBe(false);
  });

  it('getRequired throws on missing keys', async () => {
    await expect(provider.getRequired('CKB_TEST_SECRET')).rejects.toThrow(/Required secret/);
  });

  it('has a local mode tag', () => {
    expect(provider.mode).toBe('local');
  });
});

describe('AzureKeyVaultProviderStub', () => {
  const provider = new AzureKeyVaultProviderStub();

  it('fails closed with a clear error (Non-Negotiable #8 signal)', async () => {
    await expect(provider.get('ANY')).rejects.toBeInstanceOf(NotSupportedInLocalError);
  });

  it('has an azure mode tag', () => {
    expect(provider.mode).toBe('azure');
  });
});
