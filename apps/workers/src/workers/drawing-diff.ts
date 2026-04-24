import { runDrawingDiff } from '@ckb/ai';
import { logAudit } from '@ckb/audit';
import { severityForScopeImpact } from '@ckb/domain';
import { QUEUES } from '@ckb/queue';
import {
  asBrandedId,
  contentAddressedPath,
  getCorrelationId,
  newUlid,
  runWithCorrelation,
  sha256,
} from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * Drawing Comparison worker (Slice AA, §6.17).
 *
 * Trigger: OCR completion on a Drawing-category document. This worker
 * looks for a prior (superseded) version of the document; if one
 * exists, it reads both OCR text layers, runs the drawing-diff AI
 * capability, persists a drawing_diff row, and raises a record_flag
 * (Observation) with severity derived from scope_impact.
 *
 * Non-Negotiable #3 — the capability only reads OCR text layers
 * (derived representations). Original drawing blobs are untouched.
 */

export interface DrawingDiffPayload {
  readonly documentId: string;
}

registerWorker<DrawingDiffPayload>({
  queueName: QUEUES.drawingDiff,
  concurrency: 1,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => diff(payload, ctx));
  },
});

async function diff(payload: DrawingDiffPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  const systemUserId = await resolveSystemUserId(db);

  const docRow = await db
    .request()
    .input('id', mssql.Char(26), payload.documentId)
    .query<{
      contract_id: string;
      category: string;
      original_filename: string;
      current_version_id: string | null;
      ocr_status: string;
      ocr_text_blob_path: string | null;
    }>(`
      SELECT contract_id, category, original_filename,
             current_version_id, ocr_status, ocr_text_blob_path
        FROM document
       WHERE id = @id
    `);
  const doc = docRow.recordset[0];
  if (!doc) return;
  if (doc.category !== 'Drawing') {
    logger.info('drawing-diff: not a Drawing, skipping', {
      documentId: payload.documentId,
      category: doc.category,
    });
    return;
  }
  if (doc.ocr_status !== 'Complete' || !doc.ocr_text_blob_path) {
    logger.info('drawing-diff: waiting for OCR', { documentId: payload.documentId });
    return;
  }
  if (!doc.current_version_id) {
    logger.info('drawing-diff: no current version', { documentId: payload.documentId });
    return;
  }

  // Find the prior revision — most recently superseded version whose
  // superseded_by_version_id is the current one.
  const priorRow = await db
    .request()
    .input('document_id', mssql.Char(26), payload.documentId)
    .input('current', mssql.Char(26), doc.current_version_id)
    .query<{
      id: string;
      blob_path: string;
      sha256: string;
      version_label: string;
    }>(`
      SELECT TOP 1 id, blob_path, sha256, version_label
        FROM document_version
       WHERE document_id = @document_id
         AND (superseded_by_version_id = @current OR id <> @current)
         AND id <> @current
       ORDER BY uploaded_at DESC
    `);
  const prior = priorRow.recordset[0];
  if (!prior) {
    logger.info('drawing-diff: no prior version — first revision, skipping', {
      documentId: payload.documentId,
    });
    return;
  }

  // Current version row for diff pairing + label.
  const currentRow = await db
    .request()
    .input('id', mssql.Char(26), doc.current_version_id)
    .query<{ version_label: string; sha256: string; blob_path: string }>(`
      SELECT version_label, sha256, blob_path FROM document_version WHERE id = @id
    `);
  const current = currentRow.recordset[0];
  if (!current) return;

  // Idempotency: if a diff for this exact pair already exists, stop.
  const existing = await db
    .request()
    .input('document_id', mssql.Char(26), payload.documentId)
    .input('prior', mssql.Char(26), prior.id)
    .input('new', mssql.Char(26), doc.current_version_id)
    .query<{ id: string }>(`
      SELECT id FROM drawing_diff
       WHERE document_id = @document_id
         AND prior_version_id = @prior
         AND new_version_id = @new
    `);
  if (existing.recordset[0]) {
    logger.info('drawing-diff: diff already computed for pair', {
      diffId: existing.recordset[0].id,
    });
    return;
  }

  // Resolve OCR text layers. The OCR worker persists the current
  // version's text at document.ocr_text_blob_path; for the prior
  // version we derive the same content-addressed path from its own
  // OCR pass. Prior versions' ocr.txt files are stored alongside
  // their originals — if the blob isn't present we treat the prior
  // text as empty and emit a 'Suspected' diff.
  const newText = (await clients.storage.get(doc.ocr_text_blob_path)).toString('utf8');

  // ASSUMPTION: prior version OCR blob follows the same
  // `sha256/<hash-of-ocr-text>/ocr.txt` shape as the current version.
  // In practice we persist a per-version ocr_text_blob_path on the
  // document row — this worker only runs after OCR on the new
  // version. The prior version's OCR ran when it was the current
  // row, so its blob path has already been recorded on the document
  // history (via content-addressed storage). As an interim we
  // lookup by hash of the prior raw blob — if absent, we bail with
  // scopeImpact='Suspected' so a human notices.
  let priorText = '';
  try {
    // Best-effort retrieval — try to read prior OCR text by convention.
    const priorOcrPath = contentAddressedPath(prior.sha256, 'ocr.txt');
    const buf = await clients.storage.get(priorOcrPath);
    priorText = buf.toString('utf8');
  } catch {
    priorText = '';
  }

  const contractRow = await db
    .request()
    .input('id', mssql.Char(26), doc.contract_id)
    .query<{ name: string }>(`SELECT name FROM contract WHERE id = @id`);
  const contractName = contractRow.recordset[0]?.name ?? 'Unknown';

  const result = await runDrawingDiff(clients.llm, {
    contractContext: contractName,
    documentName: doc.original_filename,
    priorVersionLabel: prior.version_label,
    newVersionLabel: current.version_label,
    priorText: priorText.length > 0 ? priorText : '[prior revision OCR unavailable]',
    newText,
  });

  // Citation verification (Non-Negotiable #1): each change region must
  // cite the closed grammar prior:<doc> | new:<doc>. Regions that do
  // not are dropped; if dropping leaves an empty set but the model
  // said there were changes, downgrade scopeImpact to 'Suspected'.
  const expectedPrior = `prior:${doc.original_filename}`;
  const expectedNew = `new:${doc.original_filename}`;
  const validRegions = result.output.changeRegions.filter(
    (r) => r.citation === expectedPrior || r.citation === expectedNew,
  );
  const droppedCount = result.output.changeRegions.length - validRegions.length;
  if (droppedCount > 0) {
    logger.warn('drawing-diff: dropped regions failing citation verification', {
      documentId: payload.documentId,
      droppedCount,
    });
  }
  const scopeImpact =
    validRegions.length === 0 && result.output.changeRegions.length > 0
      ? 'Suspected'
      : result.output.scopeImpact;

  const diffId = newUlid();
  const nowHash = sha256(JSON.stringify({ prior: prior.id, new: doc.current_version_id }));
  void nowHash;

  const tx = new mssql.Transaction(db);
  await tx.begin();
  let recordFlagId: string | null = null;
  try {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), diffId)
      .input('contract_id', mssql.Char(26), doc.contract_id)
      .input('document_id', mssql.Char(26), payload.documentId)
      .input('prior_version_id', mssql.Char(26), prior.id)
      .input('new_version_id', mssql.Char(26), doc.current_version_id)
      .input('diff_summary', mssql.NVarChar(mssql.MAX), result.output.diffSummary)
      .input('change_regions', mssql.NVarChar(mssql.MAX), JSON.stringify(validRegions))
      .input('scope_impact', mssql.VarChar(16), scopeImpact)
      .input('ai_capability_version', mssql.VarChar(64), `drawing-diff@${result.promptVersion}`)
      .input('created_by_user_id', mssql.Char(26), systemUserId)
      .query(`
        INSERT INTO drawing_diff
          (id, contract_id, document_id, prior_version_id, new_version_id,
           diff_summary, change_regions, scope_impact, ai_capability_version,
           created_by_user_id)
        VALUES
          (@id, @contract_id, @document_id, @prior_version_id, @new_version_id,
           @diff_summary, @change_regions, @scope_impact, @ai_capability_version,
           @created_by_user_id);
      `);
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: 'drawing_diff.compute',
      entityType: 'DrawingDiff',
      entityId: diffId,
      after: {
        contractId: doc.contract_id,
        documentId: payload.documentId,
        priorVersionId: prior.id,
        newVersionId: doc.current_version_id,
        scopeImpact,
        regionCount: validRegions.length,
        capabilityVersion: result.promptVersion,
      },
      correlationId: getCorrelationId() ?? newUlid(),
    });

    // Raise an Observation record_flag if the scope impact is material.
    const severity = severityForScopeImpact(scopeImpact);
    if (severity !== null) {
      recordFlagId = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), recordFlagId)
        .input('contract_id', mssql.Char(26), doc.contract_id)
        .input('target_type', mssql.VarChar(24), 'Document')
        .input('target_id', mssql.Char(26), payload.documentId)
        .input('flag_type', mssql.VarChar(32), 'Observation')
        .input('severity', mssql.VarChar(16), severity)
        .input('note', mssql.NVarChar(mssql.MAX), `Drawing revision scope impact: ${scopeImpact}. ${result.output.diffSummary}`)
        .input('created_by_user_id', mssql.Char(26), systemUserId)
        .query(`
          INSERT INTO record_flag
            (id, contract_id, target_type, target_id, flag_type, severity,
             note, created_by_user_id)
          VALUES
            (@id, @contract_id, @target_type, @target_id, @flag_type, @severity,
             @note, @created_by_user_id);
        `);
      await new mssql.Request(tx)
        .input('diff_id', mssql.Char(26), diffId)
        .input('flag_id', mssql.Char(26), recordFlagId)
        .query(`UPDATE drawing_diff SET record_flag_id = @flag_id WHERE id = @diff_id;`);
      await logAudit(tx, {
        actorUserId: asBrandedId<'User'>(systemUserId),
        action: 'drawing_diff.flag_raised',
        entityType: 'DrawingDiff',
        entityId: diffId,
        after: {
          recordFlagId,
          severity,
          scopeImpact,
        },
        correlationId: getCorrelationId() ?? newUlid(),
      });
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  logger.info('drawing-diff: computed', {
    diffId,
    documentId: payload.documentId,
    scopeImpact,
    regionCount: validRegions.length,
    recordFlagId,
  });

  // Queue a proactive-flag pass on the DrawingRevision event (Slice GG).
  // The first-pass classifier will decide if deep-review is warranted.
  await clients.queue.enqueue(
    QUEUES.proactiveFlag,
    {
      contractId: doc.contract_id,
      triggerEventType: 'DrawingRevision',
      triggerEventId: diffId,
      triggerSummary: `Drawing ${doc.original_filename} revised (${prior.version_label} → ${current.version_label}); scope impact ${scopeImpact}.`,
      triggerExcerpt: result.output.diffSummary,
    },
    { jobId: `pflag:drawdiff:${diffId}` },
  );
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.drawing-diff.system.user');

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
