import { contentAddressedPath, newUlid, sha256, type Logger } from '@ckb/shared';
import type { QueueClient } from '@ckb/queue';
import { QUEUES } from '@ckb/queue';
import type { StorageClient } from '@ckb/storage';

/**
 * First-stage ingestion: accepts the raw bytes of an inbound email and any
 * metadata available at the receive boundary (provider, envelope recipients).
 *
 * Responsibilities:
 *   1. Hash the raw bytes.
 *   2. Store to blob at `sha256/<hash>/raw.eml` with ifNoneMatch='*' — Non-Negotiable #3.
 *   3. Enqueue the `email.ingest.v1` job keyed on the content hash + first recipient
 *      so webhook retries dedupe at the queue layer.
 *
 * Database persistence of `inbound_email_event` and the full parse pipeline
 * are the worker's responsibility (Slice D).
 */

export interface AcceptEmailInput {
  readonly rawBytes: Buffer;
  readonly envelopeTo: readonly string[];
  readonly envelopeFrom: string;
  readonly provider: 'SendGrid' | 'LocalFolderWatcher';
  readonly source: string;
}

export interface AcceptEmailOutput {
  readonly inboundEventId: string;
  readonly rawEmlSha256: string;
  readonly blobPath: string;
  readonly jobId: string;
  readonly alreadySeen: boolean;
}

export interface IngestionPipelineDeps {
  readonly storage: StorageClient;
  readonly queue: QueueClient;
  readonly logger: Logger;
}

export async function acceptInboundEmail(
  input: AcceptEmailInput,
  deps: IngestionPipelineDeps,
): Promise<AcceptEmailOutput> {
  const hash = sha256(input.rawBytes);
  const blobPath = contentAddressedPath(hash, 'raw.eml');

  const putResult = await deps.storage.put(blobPath, input.rawBytes, {
    contentType: 'message/rfc822',
    ifNoneMatch: '*',
  });

  const inboundEventId = newUlid();
  const primaryRecipient = input.envelopeTo[0] ?? 'unknown';
  const jobId = `${hash}:${primaryRecipient}`;

  await deps.queue.enqueue(
    QUEUES.emailIngest,
    {
      inboundEventId,
      rawEmlSha256: hash,
      blobPath,
      envelopeTo: input.envelopeTo,
      envelopeFrom: input.envelopeFrom,
      provider: input.provider,
      source: input.source,
    },
    { jobId },
  );

  deps.logger.info('inbound email accepted', {
    inboundEventId,
    rawEmlSha256: hash,
    envelopeTo: input.envelopeTo,
    alreadySeen: !putResult.created,
  });

  return {
    inboundEventId,
    rawEmlSha256: hash,
    blobPath,
    jobId,
    alreadySeen: !putResult.created,
  };
}
