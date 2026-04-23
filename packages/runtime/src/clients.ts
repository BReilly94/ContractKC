import { createLLMClient, type LLMClient } from '@ckb/ai';
import { createOcrClient, type OcrClient } from '@ckb/ocr';
import { createQueueClient, type QueueClient } from '@ckb/queue';
import { createMalwareScanner, type MalwareScanner } from '@ckb/scanning';
import { createSearchClient, type SearchClient } from '@ckb/search';
import { createStorageClient, type StorageClient } from '@ckb/storage';
import type { RuntimeConfig } from './config.js';

/**
 * Every provider client used across the API, workers, and ingestion apps.
 * Constructed from a RuntimeConfig once at startup, passed by DI.
 */
export interface RuntimeClients {
  readonly storage: StorageClient;
  readonly queue: QueueClient;
  readonly search: SearchClient;
  readonly scanner: MalwareScanner;
  readonly llm: LLMClient;
  readonly ocr: OcrClient;
}

export function createRuntimeClients(config: RuntimeConfig): RuntimeClients {
  const storage = createStorageClient({
    mode: config.providerMode,
    connectionString: config.storageConnectionString,
    containerName: config.storageContainer,
  });
  const queue = createQueueClient({
    mode: config.providerMode,
    redisUrl: config.redisUrl,
  });
  const search = createSearchClient({
    mode: config.providerMode,
    node: config.searchNode,
    embeddingDim: config.searchEmbeddingDim,
    ...(config.searchIndexPrefix !== undefined
      ? { indexPrefix: config.searchIndexPrefix }
      : {}),
  });
  const scanner = createMalwareScanner({
    mode: config.providerMode,
    clamavHost: config.clamavHost,
    clamavPort: config.clamavPort,
  });
  const llm = createLLMClient({
    apiKey: config.anthropicApiKey,
    zeroRetention: config.anthropicZeroRetention,
  });
  const ocr = createOcrClient({ mode: config.providerMode });
  return { storage, queue, search, scanner, llm, ocr };
}
