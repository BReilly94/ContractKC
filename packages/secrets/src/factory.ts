import { AzureKeyVaultProviderStub, EnvSecretsProvider } from './env-impl.js';
import type { SecretsProvider } from './interface.js';

export function createSecretsProvider(mode: string | undefined): SecretsProvider {
  const resolved = mode ?? 'local';
  if (resolved === 'local') return new EnvSecretsProvider();
  if (resolved === 'azure') return new AzureKeyVaultProviderStub();
  throw new Error(`Unknown PROVIDER_MODE: ${mode}`);
}
