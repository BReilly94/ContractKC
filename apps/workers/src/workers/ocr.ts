import { logAudit } from '@ckb/audit';
import { QUEUES } from '@ckb/queue';
import { asBrandedId, contentAddressedPath, getCorrelationId, newUlid, runWithCorrelation, sha256 } from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * OCR worker for `document.ocr.v1` — §5.1 item 5.
 *
 * PDF with text layer → extracted trivially.
 * PDF without text → Tesseract rasterization (handled inside the OcrClient;
 *   local impl returns `provider: 'tesseract'` with empty pages until the
 *   rasterizer lands — marked // ASSUMPTION).
 * Images → Tesseract directly.
 *
 * Output text is stored as a separate blob at `sha256/<original-hash>/ocr.txt`
 * — Non-Negotiable #3: original is never altered.
 */

export interface OcrPayload {
  readonly documentId: string;
  readonly blobPath: string;
  readonly mimeType: string;
  readonly language: string;
}

registerWorker<OcrPayload>({
  queueName: QUEUES.ocr,
  concurrency: 2,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => runOcr(payload, ctx));
  },
});

async function runOcr(payload: OcrPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  const systemUserId = await resolveSystemUserId(db);

  // OCR only runs on retrievable content — but since malware scan is async,
  // we might arrive before it completes. If not Clean yet, re-queue with a delay.
  const docRow = await db
    .request()
    .input('id', mssql.Char(26), payload.documentId)
    .query<{ malware_scan_status: string; ocr_status: string; sha256: string }>(
      `SELECT malware_scan_status, ocr_status, sha256 FROM document WHERE id = @id`,
    );
  const row = docRow.recordset[0];
  if (!row) {
    logger.warn('ocr: document row not found, skipping', { documentId: payload.documentId });
    return;
  }
  if (row.malware_scan_status === 'Pending') {
    logger.info('ocr: waiting for malware scan to complete, re-queueing', {
      documentId: payload.documentId,
    });
    await clients.queue.enqueue(QUEUES.ocr, payload, {
      jobId: `ocr:${payload.documentId}:${Date.now()}`,
      delayMs: 10_000,
    });
    return;
  }
  if (row.malware_scan_status !== 'Clean') {
    await markStatus(db, payload.documentId, 'Failed', systemUserId, 'Not retrievable — quarantined');
    return;
  }
  if (row.ocr_status === 'Complete') {
    // Already done.
    return;
  }

  try {
    const bytes = await clients.storage.get(payload.blobPath);
    const result = await clients.ocr.extract(bytes, payload.mimeType, { language: payload.language });

    if (result.fullText.length === 0 && result.pageCount === 0) {
      await markStatus(db, payload.documentId, 'NotRequired', systemUserId, 'Nothing to extract');
      return;
    }

    // Write OCR text as a separate blob alongside the original.
    const ocrTextBlobPath = contentAddressedPath(sha256(result.fullText), 'ocr.txt');
    await clients.storage.put(ocrTextBlobPath, Buffer.from(result.fullText, 'utf8'), {
      contentType: 'text/plain; charset=utf-8',
      ifNoneMatch: '*',
    });

    const tx = new mssql.Transaction(db);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), payload.documentId)
        .input('ocr_status', mssql.VarChar(16), 'Complete')
        .input('ocr_text_blob_path', mssql.VarChar(512), ocrTextBlobPath)
        .query(`
          UPDATE document
             SET ocr_status = @ocr_status,
                 ocr_text_blob_path = @ocr_text_blob_path,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id;
        `);
      await logAudit(tx, {
        actorUserId: asBrandedId<'User'>(systemUserId),
        action: 'document.ocr.complete',
        entityType: 'Document',
        entityId: payload.documentId,
        after: {
          provider: result.provider,
          pageCount: result.pageCount,
          hasTextLayer: result.hasTextLayer,
          characters: result.fullText.length,
        },
        correlationId: getCorrelationId() ?? newUlid(),
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    logger.info('ocr complete', {
      documentId: payload.documentId,
      provider: result.provider,
      characters: result.fullText.length,
    });

    await clients.queue.enqueue(
      QUEUES.embedIndex,
      { documentId: payload.documentId, kind: 'Document' },
      { jobId: `index:doc:${payload.documentId}:ocr` },
    );
    await clients.queue.enqueue(
      QUEUES.clauseExtract,
      { documentId: payload.documentId },
      { jobId: `clause:${payload.documentId}` },
    );
  } catch (err) {
    await markStatus(db, payload.documentId, 'Failed', systemUserId, (err as Error).message);
    throw err;
  }
}

async function markStatus(
  pool: mssql.ConnectionPool,
  documentId: string,
  status: 'Failed' | 'NotRequired',
  systemUserId: string,
  reason: string,
): Promise<void> {
  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), documentId)
      .input('ocr_status', mssql.VarChar(16), status)
      .query(
        `UPDATE document SET ocr_status = @ocr_status, updated_at = SYSDATETIMEOFFSET() WHERE id = @id;`,
      );
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: status === 'Failed' ? 'document.ocr.failed' : 'document.ocr.complete',
      entityType: 'Document',
      entityId: documentId,
      after: { ocrStatus: status, reason },
      correlationId: getCorrelationId() ?? newUlid(),
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.ocr.system.user');

async function resolveSystemUserId(pool: mssql.ConnectionPool): Promise<string> {
  const cache = globalThis as unknown as Record<symbol, string | undefined>;
  if (cache[SYSTEM_USER_CACHE]) return cache[SYSTEM_USER_CACHE]!;
  const r = await pool.request().query<{ id: string }>(
    `SELECT TOP 1 id FROM app_user WHERE global_role IN ('SystemAdministrator','KnowledgeCentreAdministrator') ORDER BY created_at ASC`,
  );
  const id = r.recordset[0]?.id;
  if (!id) throw new Error('No SystemAdministrator/KnowledgeCentreAdministrator user');
  cache[SYSTEM_USER_CACHE] = id;
  return id;
}
