import type { User } from '@ckb/domain';
import { DevAuthProvider, EntraAuthProviderStub } from './dev-impl.js';
import type { AuthProvider } from './interface.js';

export interface AuthFactoryConfig {
  readonly authMode: string | undefined;
  readonly signingSecret: string;
  readonly devUsers: readonly User[];
}

export function createAuthProvider(config: AuthFactoryConfig): AuthProvider {
  const mode = config.authMode ?? 'local-dev';
  if (mode === 'local-dev') {
    return new DevAuthProvider({
      signingSecret: config.signingSecret,
      users: config.devUsers,
    });
  }
  if (mode === 'entra') {
    return new EntraAuthProviderStub();
  }
  throw new Error(`Unknown AUTH_MODE: ${mode}`);
}
