import { NotSupportedInLocalError } from '@ckb/shared';
import { BullMqQueueClient } from './bullmq-impl.js';
import type { QueueClient } from './interface.js';

export interface QueueFactoryConfig {
  readonly mode: 'local' | 'azure';
  readonly redisUrl: string;
  readonly serviceBusConnectionString?: string;
}

export function createQueueClient(config: QueueFactoryConfig): QueueClient {
  if (config.mode === 'local') {
    return new BullMqQueueClient(config.redisUrl);
  }
  if (config.mode === 'azure') {
    throw new NotSupportedInLocalError(
      'Azure Service Bus queue client not yet implemented; keep PROVIDER_MODE=local until cutover',
    );
  }
  throw new Error(`Unknown queue mode: ${config.mode as string}`);
}

/**
 * Canonical queue names. Keep them stable — changing a name is a data migration.
 */
export const QUEUES = {
  emailIngest: 'email.ingest.v1',
  malwareScan: 'document.malware-scan.v1',
  ocr: 'document.ocr.v1',
  embedIndex: 'retrieval.embed-index.v1',
  clauseExtract: 'ai.clause-extract.v1',
  summaryGenerate: 'ai.contract-summary.v1',
  deadlineExtract: 'ai.deadline-extract.v1',
  emailPrescreen: 'ai.email-prescreen.v1',
  linkAutoPull: 'email.shared-link.v1',
  icsParse: 'email.ics-parse.v1',
  notify: 'notify.v1',
  digest: 'notify.digest.v1',
} as const;

export type KnownQueueName = (typeof QUEUES)[keyof typeof QUEUES];
