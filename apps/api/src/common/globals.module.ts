import { createLLMClient, type LLMClient } from '@ckb/ai';
import { createAuthProvider } from '@ckb/auth';
import { createErpClient, type ErpClient } from '@ckb/erp';
import { createOcrClient, type OcrClient } from '@ckb/ocr';
import { createQueueClient, type QueueClient } from '@ckb/queue';
import { createMalwareScanner, type MalwareScanner } from '@ckb/scanning';
import { createSearchClient, type SearchClient } from '@ckb/search';
import { createStorageClient, type StorageClient } from '@ckb/storage';
import { loadRuntimeConfig, type RuntimeConfig } from '@ckb/runtime';
import { Global, Module } from '@nestjs/common';
import mssql from 'mssql';
import { closePool, getPool } from '../db/client.js';
import { DEV_USERS } from '../dev-users.js';
import {
  APP_CONFIG,
  AUTH_PROVIDER,
  DB_POOL,
  ERP_CLIENT,
  LLM_CLIENT,
  MALWARE_SCANNER,
  OCR_CLIENT,
  QUEUE_CLIENT,
  SEARCH_CLIENT,
  STORAGE_CLIENT,
} from './tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: async (): Promise<RuntimeConfig> => {
        const { config } = await loadRuntimeConfig();
        return config;
      },
    },
    {
      provide: DB_POOL,
      useFactory: async (config: RuntimeConfig): Promise<mssql.ConnectionPool> =>
        getPool(config.databaseUrl),
      inject: [APP_CONFIG],
    },
    {
      provide: AUTH_PROVIDER,
      useFactory: (config: RuntimeConfig) =>
        createAuthProvider({
          authMode: config.authMode,
          signingSecret: config.jwtSecret,
          devUsers: DEV_USERS,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: STORAGE_CLIENT,
      useFactory: (config: RuntimeConfig): StorageClient =>
        createStorageClient({
          mode: config.providerMode,
          connectionString: config.storageConnectionString,
          containerName: config.storageContainer,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: QUEUE_CLIENT,
      useFactory: (config: RuntimeConfig): QueueClient =>
        createQueueClient({ mode: config.providerMode, redisUrl: config.redisUrl }),
      inject: [APP_CONFIG],
    },
    {
      provide: SEARCH_CLIENT,
      useFactory: (config: RuntimeConfig): SearchClient =>
        createSearchClient({
          mode: config.providerMode,
          node: config.searchNode,
          embeddingDim: config.searchEmbeddingDim,
          ...(config.searchIndexPrefix !== undefined
            ? { indexPrefix: config.searchIndexPrefix }
            : {}),
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: MALWARE_SCANNER,
      useFactory: (config: RuntimeConfig): MalwareScanner =>
        createMalwareScanner({
          mode: config.providerMode,
          clamavHost: config.clamavHost,
          clamavPort: config.clamavPort,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: LLM_CLIENT,
      useFactory: (config: RuntimeConfig): LLMClient =>
        createLLMClient({
          apiKey: config.anthropicApiKey,
          zeroRetention: config.anthropicZeroRetention,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: OCR_CLIENT,
      useFactory: (config: RuntimeConfig): OcrClient =>
        createOcrClient({ mode: config.providerMode }),
      inject: [APP_CONFIG],
    },
    {
      provide: ERP_CLIENT,
      useFactory: (config: RuntimeConfig): ErpClient =>
        createErpClient({
          ...(config.erpSourceSystem !== undefined ? { sourceSystem: config.erpSourceSystem } : {}),
          ...(config.erpEndpointUrl !== undefined ? { endpointUrl: config.erpEndpointUrl } : {}),
          ...(config.erpApiKey !== undefined ? { apiKey: config.erpApiKey } : {}),
        }),
      inject: [APP_CONFIG],
    },
  ],
  exports: [
    APP_CONFIG,
    DB_POOL,
    AUTH_PROVIDER,
    STORAGE_CLIENT,
    QUEUE_CLIENT,
    SEARCH_CLIENT,
    MALWARE_SCANNER,
    LLM_CLIENT,
    OCR_CLIENT,
    ERP_CLIENT,
  ],
})
export class GlobalsModule {
  async onApplicationShutdown(): Promise<void> {
    await closePool();
  }
}
