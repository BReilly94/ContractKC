import type { SecretsProvider } from '@ckb/secrets';
import { createSecretsProvider } from '@ckb/secrets';

/**
 * Runtime config shared across API, workers, and ingestion apps.
 *
 * Loading policy:
 *  - `PROVIDER_MODE` decides which SecretsProvider backs the rest of the load.
 *  - Required secrets are fetched via `getRequired`; missing secrets fail at
 *    startup, not later at call site.
 *  - `NODE_ENV=production` forbids `AUTH_MODE=local-dev` — fail closed.
 */
export interface RuntimeConfig {
  readonly apiPort: number;
  readonly webBaseUrl: string;
  readonly databaseUrl: string;
  readonly authMode: 'local-dev' | 'entra';
  readonly providerMode: 'local' | 'azure';
  readonly jwtSecret: string;
  readonly nodeEnv: 'development' | 'test' | 'production';

  readonly storageConnectionString: string;
  readonly storageContainer: string;

  readonly redisUrl: string;

  readonly searchNode: string;
  readonly searchEmbeddingDim: number;
  readonly searchIndexPrefix: string | undefined;

  readonly clamavHost: string;
  readonly clamavPort: number;

  readonly anthropicApiKey: string | undefined;
  readonly anthropicZeroRetention: boolean;

  readonly emailInboxDir: string;
  readonly emailProcessedDir: string;
  readonly emailDomain: string;

  readonly smtpHost: string;
  readonly smtpPort: number;
}

export async function loadRuntimeConfig(): Promise<{
  config: RuntimeConfig;
  secrets: SecretsProvider;
}> {
  const providerMode = (process.env['PROVIDER_MODE'] ?? 'local') as 'local' | 'azure';
  const secrets = createSecretsProvider(providerMode);

  const databaseUrl = await secrets.getRequired('DATABASE_URL');
  const jwtSecret = await secrets.getRequired('JWT_SECRET');
  const storageConnectionString = await secrets.getRequired('STORAGE_CONNECTION_STRING');
  const redisUrl = await secrets.getRequired('REDIS_URL');

  const authModeRaw = process.env['AUTH_MODE'] ?? 'local-dev';
  if (authModeRaw !== 'local-dev' && authModeRaw !== 'entra') {
    throw new Error(`Invalid AUTH_MODE: ${authModeRaw}`);
  }
  const nodeEnv = (process.env['NODE_ENV'] ?? 'development') as
    | 'development'
    | 'test'
    | 'production';
  if (authModeRaw === 'local-dev' && nodeEnv === 'production') {
    throw new Error('AUTH_MODE=local-dev is forbidden in production — fail-closed');
  }

  const anthropicApiKey = await secrets.get('ANTHROPIC_API_KEY');
  const zeroRetention = (await secrets.get('ANTHROPIC_ZERO_RETENTION')) === 'true';
  if (anthropicApiKey && !zeroRetention) {
    throw new Error(
      'ANTHROPIC_ZERO_RETENTION must be true when ANTHROPIC_API_KEY is set ' +
        '(ai-layer.md §8 — zero-retention is not optional)',
    );
  }

  return {
    config: {
      apiPort: Number(process.env['API_PORT'] ?? 4000),
      webBaseUrl: process.env['WEB_BASE_URL'] ?? 'http://localhost:3000',
      databaseUrl,
      authMode: authModeRaw,
      providerMode,
      jwtSecret,
      nodeEnv,

      storageConnectionString,
      storageContainer: process.env['STORAGE_CONTAINER'] ?? 'ckb',

      redisUrl,

      searchNode: process.env['SEARCH_NODE'] ?? 'http://localhost:9200',
      searchEmbeddingDim: Number(process.env['SEARCH_EMBEDDING_DIM'] ?? 384),
      searchIndexPrefix: process.env['SEARCH_INDEX_PREFIX'],

      clamavHost: process.env['CLAMAV_HOST'] ?? 'localhost',
      clamavPort: Number(process.env['CLAMAV_PORT'] ?? 3310),

      anthropicApiKey: anthropicApiKey ?? undefined,
      anthropicZeroRetention: zeroRetention,

      emailInboxDir: process.env['EMAIL_INBOX_DIR'] ?? 'dev/inbox',
      emailProcessedDir: process.env['EMAIL_PROCESSED_DIR'] ?? 'dev/processed',
      emailDomain: process.env['EMAIL_DOMAIN'] ?? 'contracts.technicamining.com',

      smtpHost: process.env['SMTP_HOST'] ?? 'localhost',
      smtpPort: Number(process.env['SMTP_PORT'] ?? 1025),
    },
    secrets,
  };
}
