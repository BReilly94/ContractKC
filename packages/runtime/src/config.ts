import type { ErpSourceSystem } from '@ckb/erp';
import type { SecretsProvider } from '@ckb/secrets';
import { createSecretsProvider } from '@ckb/secrets';

const ERP_SOURCE_VALUES: readonly ErpSourceSystem[] = [
  'Manual',
  'SAP',
  'Dynamics',
  'Viewpoint',
  'JDE',
  'Other',
];

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

  readonly erpSourceSystem: ErpSourceSystem | undefined;
  readonly erpEndpointUrl: string | undefined;
  readonly erpApiKey: string | undefined;
  readonly bidIntegrationToken: string | undefined;
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
  const erpSourceSystemRaw = process.env['ERP_SOURCE_SYSTEM'];
  let erpSourceSystem: ErpSourceSystem | undefined;
  if (erpSourceSystemRaw !== undefined && erpSourceSystemRaw !== '') {
    if (!ERP_SOURCE_VALUES.includes(erpSourceSystemRaw as ErpSourceSystem)) {
      throw new Error(`Invalid ERP_SOURCE_SYSTEM: ${erpSourceSystemRaw}`);
    }
    erpSourceSystem = erpSourceSystemRaw as ErpSourceSystem;
  }
  const erpEndpointUrl = process.env['ERP_ENDPOINT_URL'];
  const erpApiKey = (await secrets.get('ERP_API_KEY')) ?? undefined;
  const bidIntegrationToken = (await secrets.get('BID_INTEGRATION_TOKEN')) ?? undefined;
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

      erpSourceSystem,
      erpEndpointUrl: erpEndpointUrl !== '' ? erpEndpointUrl : undefined,
      erpApiKey,
      bidIntegrationToken,
    },
    secrets,
  };
}
