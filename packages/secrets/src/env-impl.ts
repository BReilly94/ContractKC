import { NotSupportedInLocalError } from '@ckb/shared';
import type { SecretsProvider } from './interface.js';

export class EnvSecretsProvider implements SecretsProvider {
  readonly mode = 'local' as const;

  async get(key: string): Promise<string | undefined> {
    const v = process.env[key];
    return v === undefined || v === '' ? undefined : v;
  }

  async getRequired(key: string): Promise<string> {
    const v = await this.get(key);
    if (v === undefined) {
      throw new Error(`Required secret not set: ${key}`);
    }
    return v;
  }

  async has(key: string): Promise<boolean> {
    const v = await this.get(key);
    return v !== undefined;
  }
}

export class AzureKeyVaultProviderStub implements SecretsProvider {
  readonly mode = 'azure' as const;

  async get(_key: string): Promise<string | undefined> {
    throw new NotSupportedInLocalError(
      'Azure Key Vault provider not yet implemented; keep PROVIDER_MODE=local until cutover',
    );
  }

  async getRequired(_key: string): Promise<string> {
    throw new NotSupportedInLocalError('Azure Key Vault provider not yet implemented');
  }

  async has(_key: string): Promise<boolean> {
    throw new NotSupportedInLocalError('Azure Key Vault provider not yet implemented');
  }
}
