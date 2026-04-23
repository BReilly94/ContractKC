import { runClauseExtract } from '@ckb/ai';
import { logAudit } from '@ckb/audit';
import { QUEUES } from '@ckb/queue';
import type { RetrievalChunk } from '@ckb/search';
import { asBrandedId, contentAddressedPath, getCorrelationId, newUlid, runWithCorrelation } from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * Clause extraction worker (§5.6).
 *
 * Runs after OCR is Complete. Reads the document's OCR text blob, hands to
 * the clause-extract capability, inserts clause rows, and indexes clause
 * chunks into the contract's namespace so retrieval can score clauses
 * directly (for citation verifier resolution).
 *
 * Position metadata (page, char offsets) is per-document but not per-clause
 * — the model doesn't get the original pagination. For Phase 1 we record
 * the clause text and leave char offsets unset; deep-linking falls back to
 * the document viewer's text search on the clause heading + first line.
 * Real offsets come from a clause-by-document-layout alignment pass that
 * lands with §6 when we have real contract fixtures to calibrate against.
 */

export interface ClauseExtractPayload {
  readonly documentId: string;
}

registerWorker<ClauseExtractPayload>({
  queueName: QUEUES.clauseExtract,
  concurrency: 1,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => extract(payload, ctx));
  },
});

async function extract(payload: ClauseExtractPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  const systemUserId = await resolveSystemUserId(db);

  const r = await db
    .request()
    .input('id', mssql.Char(26), payload.documentId)
    .query<{
      contract_id: string;
      category: string;
      ocr_status: string;
      ocr_text_blob_path: string | null;
      original_filename: string;
      current_version_id: string | null;
    }>(`
      SELECT contract_id, category, ocr_status, ocr_text_blob_path,
             original_filename, current_version_id
        FROM document WHERE id = @id
    `);
  const row = r.recordset[0];
  if (!row) return;
  // Extract only contract-like documents; skip correspondence/emails
  // attachments unless they're a contract category.
  const extractable = ['MasterAgreement', 'Schedule', 'Appendix', 'Amendment', 'Specification'];
  if (!extractable.includes(row.category)) {
    logger.info('clause-extract: skipping non-contract document', {
      documentId: payload.documentId,
      category: row.category,
    });
    return;
  }
  if (row.ocr_status !== 'Complete' || !row.ocr_text_blob_path) {
    logger.info('clause-extract: waiting for OCR', { documentId: payload.documentId });
    return;
  }

  const textBuf = await clients.storage.get(row.ocr_text_blob_path);
  const text = textBuf.toString('utf8');
  if (text.trim().length === 0) return;

  const result = await runClauseExtract(clients.llm, {
    documentName: row.original_filename,
    documentText: text.slice(0, 120_000), // ASSUMPTION: cap to ~30k tokens per extraction pass
  });
  if (result.output.clauses.length === 0) {
    logger.info('clause-extract: no clauses found', { documentId: payload.documentId });
    return;
  }

  const tx = new mssql.Transaction(db);
  await tx.begin();
  const insertedClauses: Array<{ id: string; text: string; clauseNumber: string | null; heading: string | null; clauseType: string; confidence: string }> = [];
  try {
    for (const c of result.output.clauses) {
      const id = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), row.contract_id)
        .input('source_document_id', mssql.Char(26), payload.documentId)
        .input('source_document_version_id', mssql.Char(26), row.current_version_id)
        .input('clause_number', mssql.NVarChar(64), c.clauseNumber)
        .input('heading', mssql.NVarChar(256), c.heading)
        .input('text', mssql.NVarChar(mssql.MAX), c.text)
        .input('clause_type', mssql.VarChar(40), c.clauseType)
        .input('capability_version', mssql.VarChar(64), result.promptVersion)
        .input('confidence', mssql.VarChar(16), c.confidence)
        .query(`
          INSERT INTO clause
            (id, contract_id, source_document_id, source_document_version_id,
             clause_number, heading, [text], clause_type,
             extracted_by_capability_version, extraction_confidence,
             verification_state, is_superseded)
          VALUES
            (@id, @contract_id, @source_document_id, @source_document_version_id,
             @clause_number, @heading, @text, @clause_type,
             @capability_version, @confidence,
             'Unverified', 0);
        `);
      await logAudit(tx, {
        actorUserId: asBrandedId<'User'>(systemUserId),
        action: 'clause.extract',
        entityType: 'Clause',
        entityId: id,
        after: {
          contractId: row.contract_id,
          documentId: payload.documentId,
          clauseNumber: c.clauseNumber,
          clauseType: c.clauseType,
        },
        correlationId: getCorrelationId() ?? newUlid(),
      });
      insertedClauses.push({
        id,
        text: c.text,
        clauseNumber: c.clauseNumber,
        heading: c.heading,
        clauseType: c.clauseType,
        confidence: c.confidence,
      });
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  // Index the clauses as retrieval chunks. Non-Negotiable #1 — clauses are
  // citation targets; having them in the index lets qa-synth cite them
  // directly rather than re-anchoring via document chunks.
  await clients.search.ensureNamespace(row.contract_id);
  const clauseChunks: RetrievalChunk[] = insertedClauses.map((c) => ({
    chunkId: `clause:${c.id}`,
    contractId: row.contract_id,
    text: c.text,
    source: {
      type: 'Clause' as const,
      id: c.id,
      ...(c.clauseNumber !== null ? { clauseNumber: c.clauseNumber } : {}),
    },
    metadata: {
      documentId: payload.documentId,
      clauseType: c.clauseType,
      confidence: c.confidence,
      blobPath: contentAddressedPath('0'.repeat(64), 'placeholder'),
    },
  }));
  await clients.search.indexChunks(row.contract_id, clauseChunks);

  logger.info('clause-extract: inserted + indexed', {
    documentId: payload.documentId,
    clauseCount: insertedClauses.length,
  });
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.clause.system.user');

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
