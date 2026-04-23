import { QUEUES } from '@ckb/queue';
import {
  chunkText,
  HashEmbeddingProvider,
  type RetrievalChunk,
} from '@ckb/search';
import { getCorrelationId, newUlid, runWithCorrelation } from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * Worker for `retrieval.embed-index.v1`. Produces retrieval chunks from
 * a Document (OCR text) or an Email (body_text), embeds them, and writes
 * to the contract's isolated SearchClient namespace (Non-Negotiable #6).
 *
 * Idempotency: we delete-by-source before re-indexing, so re-running the
 * job replaces the previous chunks atomically at the index level. OpenSearch
 * bulk writes are batched; we commit only after a clean bulk response.
 */

export type EmbedIndexPayload =
  | { documentId: string; kind: 'Document' }
  | { emailId: string; contractId: string; kind: 'Email' };

registerWorker<EmbedIndexPayload>({
  queueName: QUEUES.embedIndex,
  concurrency: 2,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => processIndex(payload, ctx));
  },
});

async function processIndex(payload: EmbedIndexPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger, config } = ctx;
  await clients.search.ensureNamespace('placeholder'); // cheap no-op for cached namespaces
  // ASSUMPTION: we pick the hash embedding provider until Azure OpenAI lands.
  // SearchClient.embeddingDim is the source of truth for vector dimensionality.
  const embedder = new HashEmbeddingProvider(clients.search.embeddingDim);

  if (payload.kind === 'Document') {
    await indexDocument(payload.documentId, db, clients, embedder, logger, config.searchEmbeddingDim);
  } else {
    await indexEmail(payload.emailId, payload.contractId, db, clients, embedder, logger);
  }
}

async function indexDocument(
  documentId: string,
  db: mssql.ConnectionPool,
  clients: WorkerContext['clients'],
  embedder: HashEmbeddingProvider,
  logger: WorkerContext['logger'],
  _dim: number,
): Promise<void> {
  const r = await db
    .request()
    .input('id', mssql.Char(26), documentId)
    .query<{
      contract_id: string;
      malware_scan_status: string;
      ocr_status: string;
      ocr_text_blob_path: string | null;
      original_filename: string;
      category: string;
      current_version_id: string | null;
    }>(`
      SELECT contract_id, malware_scan_status, ocr_status, ocr_text_blob_path,
             original_filename, category, current_version_id
        FROM document WHERE id = @id
    `);
  const row = r.recordset[0];
  if (!row) {
    logger.warn('embed-index: document not found', { documentId });
    return;
  }
  if (row.malware_scan_status !== 'Clean') {
    logger.info('embed-index: skipping, not yet clean', { documentId });
    return;
  }
  if (row.ocr_status !== 'Complete' || !row.ocr_text_blob_path) {
    logger.info('embed-index: skipping, OCR not complete', { documentId });
    return;
  }

  const textBuf = await clients.storage.get(row.ocr_text_blob_path);
  const text = textBuf.toString('utf8');
  const chunks = chunkText({ text, maxChars: 1800, overlapChars: 200 });
  if (chunks.length === 0) {
    logger.info('embed-index: no chunks', { documentId });
    return;
  }

  await clients.search.ensureNamespace(row.contract_id);
  await clients.search.deleteBySource(row.contract_id, 'Document', documentId);

  const embeddings = await embedder.embed(chunks.map((c) => c.text));
  const retrievalChunks: RetrievalChunk[] = chunks.map((c, i) => {
    const embedding = embeddings[i] ?? [];
    const base = {
      chunkId: `doc:${documentId}:${i}`,
      contractId: row.contract_id,
      text: c.text,
      embedding,
      source: {
        type: 'Document' as const,
        id: documentId,
        ...(row.current_version_id
          ? { documentVersionId: row.current_version_id }
          : {}),
        ...(c.pageStart !== undefined ? { pageStart: c.pageStart, pageEnd: c.pageEnd } : {}),
        charOffsetStart: c.charOffsetStart,
        charOffsetEnd: c.charOffsetEnd,
      },
      metadata: {
        filename: row.original_filename,
        category: row.category,
      },
    };
    return base satisfies RetrievalChunk;
  });

  await clients.search.indexChunks(row.contract_id, retrievalChunks);
  logger.info('embed-index: document indexed', {
    documentId,
    chunkCount: retrievalChunks.length,
  });
}

async function indexEmail(
  emailId: string,
  contractIdHint: string,
  db: mssql.ConnectionPool,
  clients: WorkerContext['clients'],
  embedder: HashEmbeddingProvider,
  logger: WorkerContext['logger'],
): Promise<void> {
  const r = await db
    .request()
    .input('id', mssql.Char(26), emailId)
    .query<{
      contract_id: string;
      body_text: string | null;
      subject: string;
      from_address: string;
      received_at: Date;
      rfc_message_id: string;
      thread_id: string | null;
      sender_trust_state: string;
    }>(`
      SELECT contract_id, body_text, subject, from_address, received_at,
             rfc_message_id, thread_id, sender_trust_state
        FROM email WHERE id = @id
    `);
  const row = r.recordset[0];
  if (!row) {
    logger.warn('embed-index: email not found', { emailId });
    return;
  }
  if (row.sender_trust_state !== 'Approved') {
    logger.info('embed-index: email not approved, skipping', { emailId, state: row.sender_trust_state });
    return;
  }
  if (row.contract_id !== contractIdHint) {
    logger.warn('embed-index: contract id mismatch (continuing with DB value)', {
      payload: contractIdHint,
      db: row.contract_id,
    });
  }

  // Assemble email text (headers + body).
  const combined = [
    `From: ${row.from_address}`,
    `Subject: ${row.subject}`,
    `Date: ${row.received_at.toISOString()}`,
    '',
    row.body_text ?? '',
  ].join('\n');

  const chunks = chunkText({ text: combined, maxChars: 1800, overlapChars: 150 });
  if (chunks.length === 0) {
    logger.info('embed-index: no email chunks', { emailId });
    return;
  }

  await clients.search.ensureNamespace(row.contract_id);
  await clients.search.deleteBySource(row.contract_id, 'Email', emailId);

  const embeddings = await embedder.embed(chunks.map((c) => c.text));
  const retrievalChunks: RetrievalChunk[] = chunks.map((c, i) => {
    const embedding = embeddings[i] ?? [];
    return {
      chunkId: `email:${emailId}:${i}`,
      contractId: row.contract_id,
      text: c.text,
      embedding,
      source: {
        type: 'Email' as const,
        id: emailId,
        messageId: row.rfc_message_id,
        charOffsetStart: c.charOffsetStart,
        charOffsetEnd: c.charOffsetEnd,
      },
      metadata: {
        subject: row.subject,
        fromAddress: row.from_address,
        threadId: row.thread_id ?? '',
        receivedAt: row.received_at.toISOString(),
      },
    };
  });

  await clients.search.indexChunks(row.contract_id, retrievalChunks);
  logger.info('embed-index: email indexed', {
    emailId,
    chunkCount: retrievalChunks.length,
  });
}
