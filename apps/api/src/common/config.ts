import type { SecretsProvider } from '@ckb/secrets';
import { createSecretsProvider } from '@ckb/secrets';

export interface AppConfig {
  readonly apiPort: number;
  readonly webBaseUrl: string;
  readonly databaseUrl: string;
  readonly authMode: 'local-dev' | 'entra';
  readonly providerMode: 'local' | 'azure';
  readonly jwtSecret: string;
  readonly nodeEnv: 'development' | 'test' | 'production';
}

export async function loadConfig(): Promise<{ config: AppConfig; secrets: SecretsProvider }> {
  const providerMode = (process.env.PROVIDER_MODE ?? 'local') as 'local' | 'azure';
  const secrets = createSecretsProvider(providerMode);

  const databaseUrl = await secrets.getRequired('DATABASE_URL');
  const jwtSecret = await secrets.getRequired('JWT_SECRET');
  const authModeRaw = process.env.AUTH_MODE ?? 'local-dev';
  if (authModeRaw !== 'local-dev' && authModeRaw !== 'entra') {
    throw new Error(`Invalid AUTH_MODE: ${authModeRaw}`);
  }
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as
    | 'development'
    | 'test'
    | 'production';
  if (authModeRaw === 'local-dev' && nodeEnv === 'production') {
    throw new Error('AUTH_MODE=local-dev is forbidden in production — fail-closed');
  }

  return {
    config: {
      apiPort: Number(process.env.API_PORT ?? 4000),
      webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
      databaseUrl,
      authMode: authModeRaw,
      providerMode,
      jwtSecret,
      nodeEnv,
    },
    secrets,
  };
}
