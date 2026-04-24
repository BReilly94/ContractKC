import type { Principal } from '@ckb/auth';
import { QUEUES, type QueueClient } from '@ckb/queue';
import {
  contentAddressedPath,
  newUlid,
  requireCorrelationId,
  sha256,
  ValidationError,
  type Logger,
} from '@ckb/shared';
import type { StorageClient } from '@ckb/storage';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL, QUEUE_CLIENT, STORAGE_CLIENT } from '../common/tokens.js';
import type { ForwardEmailBody } from './dtos.js';

/**
 * Re-implements the three-line pipeline from `apps/ingestion/src/pipeline.ts`:
 *
 *   1. hash raw bytes
 *   2. put to blob with ifNoneMatch='*' (Non-Negotiable #3 — originals immutable)
 *   3. enqueue `email.ingest.v1` — the same queue the SendGrid webhook feeds,
 *      so thread reconstruction, malware scanning, sender trust, shared-link
 *      capture, ics parsing all run through the single worker path.
 *
 * Duplication with the ingestion app is intentional at the code level: the API
 * must not take a runtime dependency on @ckb/ingestion (separate deployable).
 * The queue contract is the integration point.
 *
 * The envelope recipient is set to the contract's canonical project email
 * address, so the worker's alias→contract resolution returns the correct
 * contract even though the email never actually hit our MX.
 */

export interface ForwardResult {
  readonly inboundEventId: string;
  readonly rawEmlSha256: string;
  readonly blobPath: string;
  readonly jobId: string;
  readonly contractId: string;
  readonly projectEmailAddress: string;
  readonly alreadySeen: boolean;
}

@Injectable()
export class InboundEmailService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  async forwardFromAddin(
    principal: Principal,
    contractId: string,
    body: ForwardEmailBody,
    logger: Logger,
  ): Promise<ForwardResult> {
    const aliasRow = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<{ project_email_address: string }>(`
        SELECT project_email_address FROM contract WHERE id = @contract_id
      `);
    const projectEmailAddress = aliasRow.recordset[0]?.project_email_address;
    if (!projectEmailAddress) {
      throw new ValidationError(`Contract ${contractId} has no project email address`);
    }

    let rawBytes: Buffer;
    try {
      rawBytes = Buffer.from(body.emlBase64, 'base64');
    } catch {
      throw new ValidationError('emlBase64 is not valid base64');
    }
    if (rawBytes.length === 0) {
      throw new ValidationError('emlBase64 decoded to zero bytes');
    }

    const hash = sha256(rawBytes);
    const blobPath = contentAddressedPath(hash, 'raw.eml');

    const putResult = await this.storage.put(blobPath, rawBytes, {
      contentType: 'message/rfc822',
      ifNoneMatch: '*',
    });

    const inboundEventId = newUlid();
    const jobId = `${hash}:${projectEmailAddress}`;

    await this.queue.enqueue(
      QUEUES.emailIngest,
      {
        inboundEventId,
        rawEmlSha256: hash,
        blobPath,
        envelopeTo: [projectEmailAddress],
        envelopeFrom: body.envelopeFrom ?? principal.user.email,
        provider: 'OutlookAddin',
        source: body.source,
        // Audit trail — who routed this email into the system via the add-in.
        forwardedByUserId: principal.userId,
        contractId,
      },
      { jobId },
    );

    logger.info('outlook addin email forwarded', {
      inboundEventId,
      rawEmlSha256: hash,
      contractId,
      forwardedByUserId: principal.userId,
      alreadySeen: !putResult.created,
      correlationId: requireCorrelationId(),
    });

    return {
      inboundEventId,
      rawEmlSha256: hash,
      blobPath,
      jobId,
      contractId,
      projectEmailAddress,
      alreadySeen: !putResult.created,
    };
  }
}
