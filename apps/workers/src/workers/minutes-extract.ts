import { runMinutesExtract } from '@ckb/ai';
import { logAudit } from '@ckb/audit';
import { computeDueAt } from '@ckb/domain';
import { QUEUES } from '@ckb/queue';
import {
  asBrandedId,
  getCorrelationId,
  newUlid,
  runWithCorrelation,
  utcNow,
} from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * Meeting Minutes Ingestion worker (Slice BB, §6.19).
 *
 * Trigger: OCR completion on a MeetingMinutes-category document. Runs
 * the minutes-extract capability, persists a meeting_minutes_extraction
 * row, and inserts each extracted action item as an Unverified
 * deadline (source_type='MeetingMinutes'). The Notice & Deadline
 * Tracker's verification gate (Non-Negotiable #2) applies.
 */

export interface MinutesExtractPayload {
  readonly documentId: string;
}

registerWorker<MinutesExtractPayload>({
  queueName: QUEUES.minutesExtract,
  concurrency: 1,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => extract(payload, ctx));
  },
});

async function extract(payload: MinutesExtractPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  const systemUserId = await resolveSystemUserId(db);

  const docRow = await db
    .request()
    .input('id', mssql.Char(26), payload.documentId)
    .query<{
      contract_id: string;
      category: string;
      original_filename: string;
      ocr_status: string;
      ocr_text_blob_path: string | null;
    }>(`
      SELECT contract_id, category, original_filename,
             ocr_status, ocr_text_blob_path
        FROM document WHERE id = @id
    `);
  const doc = docRow.recordset[0];
  if (!doc) return;
  if (doc.category !== 'MeetingMinutes') {
    logger.info('minutes-extract: not MeetingMinutes, skipping', {
      documentId: payload.documentId,
      category: doc.category,
    });
    return;
  }
  if (doc.ocr_status !== 'Complete' || !doc.ocr_text_blob_path) {
    logger.info('minutes-extract: waiting for OCR', { documentId: payload.documentId });
    return;
  }

  // Idempotency.
  const existing = await db
    .request()
    .input('document_id', mssql.Char(26), payload.documentId)
    .query<{ id: string }>(`SELECT id FROM meeting_minutes_extraction WHERE document_id = @document_id`);
  if (existing.recordset[0]) {
    logger.info('minutes-extract: already extracted', {
      extractionId: existing.recordset[0].id,
    });
    return;
  }

  const text = (await clients.storage.get(doc.ocr_text_blob_path)).toString('utf8');
  if (text.trim().length === 0) {
    logger.info('minutes-extract: empty OCR text', { documentId: payload.documentId });
    return;
  }

  const contractRow = await db
    .request()
    .input('id', mssql.Char(26), doc.contract_id)
    .query<{ name: string }>(`SELECT name FROM contract WHERE id = @id`);
  const contractName = contractRow.recordset[0]?.name ?? 'Unknown';

  const result = await runMinutesExtract(clients.llm, {
    contractContext: contractName,
    documentName: doc.original_filename,
    documentText: text.slice(0, 120_000), // ASSUMPTION: cap context at ~30k tokens
    meetingDateHint: null,
  });

  const extractionId = newUlid();
  const now = utcNow();
  const expectedCitation = `minutes:${doc.original_filename}`;

  const tx = new mssql.Transaction(db);
  await tx.begin();
  let insertedDeadlines = 0;
  try {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), extractionId)
      .input('contract_id', mssql.Char(26), doc.contract_id)
      .input('document_id', mssql.Char(26), payload.documentId)
      .input('meeting_date', mssql.Date, result.output.meetingDate)
      .input('action_item_count', mssql.Int, result.output.actionItems.length)
      .input('ai_capability_version', mssql.VarChar(64), `minutes-extract@${result.promptVersion}`)
      .input('created_by_user_id', mssql.Char(26), systemUserId)
      .query(`
        INSERT INTO meeting_minutes_extraction
          (id, contract_id, document_id, meeting_date, action_item_count,
           ai_capability_version, created_by_user_id)
        VALUES
          (@id, @contract_id, @document_id, @meeting_date, @action_item_count,
           @ai_capability_version, @created_by_user_id);
      `);
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: 'minutes.extract',
      entityType: 'MeetingMinutesExtraction',
      entityId: extractionId,
      after: {
        contractId: doc.contract_id,
        documentId: payload.documentId,
        meetingDate: result.output.meetingDate,
        actionItemCount: result.output.actionItems.length,
        capabilityVersion: result.promptVersion,
      },
      correlationId: getCorrelationId() ?? newUlid(),
    });

    for (const item of result.output.actionItems) {
      // Citation verification: the capability's closed grammar only
      // permits `minutes:<documentName>`. Items carrying anything
      // else are dropped (NN #1).
      if (item.citation !== expectedCitation) {
        logger.warn('minutes-extract: dropped item with invalid citation', {
          documentId: payload.documentId,
          citation: item.citation,
        });
        continue;
      }
      // A deadline needs at least an absoluteDate or durationDays.
      if (item.dueDate === null && item.durationDays === null) {
        logger.warn('minutes-extract: dropped item without dueDate or durationDays', {
          documentId: payload.documentId,
        });
        continue;
      }
      const deadlineId = newUlid();
      const dueAt = computeDueAt({
        absoluteDate: item.dueDate,
        durationDays: item.durationDays,
        triggeredAt: null,
      });
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), deadlineId)
        .input('contract_id', mssql.Char(26), doc.contract_id)
        .input('label', mssql.NVarChar(512), item.commitment)
        .input('responsible_party', mssql.VarChar(24), item.party)
        .input('trigger_condition', mssql.NVarChar(1024), item.triggerCondition)
        .input('duration_days', mssql.Int, item.durationDays)
        .input('absolute_date', mssql.Date, item.dueDate)
        .input('alert_lead_days', mssql.Int, 3)
        .input('consequence', mssql.NVarChar(1024), item.sourceClauseCitation)
        .input('source_type', mssql.VarChar(24), 'MeetingMinutes')
        .input('source_id', mssql.Char(26), extractionId)
        .input('source_citation', mssql.NVarChar(256), item.citation)
        .input('version', mssql.VarChar(64), `minutes-extract@${result.promptVersion}`)
        .input('system_user_id', mssql.Char(26), systemUserId)
        .input('due_at', mssql.DateTimeOffset, dueAt)
        .input('now', mssql.DateTimeOffset, now)
        .query(`
          INSERT INTO deadline
            (id, contract_id, label, responsible_party, trigger_condition,
             duration_days, absolute_date, alert_lead_days, consequence,
             verification_state, lifecycle_state, source_type, source_id,
             source_citation, extracted_by_capability_version,
             created_by_user_id, due_at, created_at, updated_at)
          VALUES
            (@id, @contract_id, @label, @responsible_party, @trigger_condition,
             @duration_days, @absolute_date, @alert_lead_days, @consequence,
             'Unverified', 'Extracted', @source_type, @source_id,
             @source_citation, @version, @system_user_id, @due_at, @now, @now);
        `);
      await logAudit(tx, {
        actorUserId: asBrandedId<'User'>(systemUserId),
        action: 'minutes.action_item.create',
        entityType: 'Deadline',
        entityId: deadlineId,
        after: {
          contractId: doc.contract_id,
          extractionId,
          party: item.party,
          commitment: item.commitment,
          dueDate: item.dueDate,
          durationDays: item.durationDays,
        },
        correlationId: getCorrelationId() ?? newUlid(),
      });
      insertedDeadlines += 1;
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  logger.info('minutes-extract: inserted Unverified deadlines', {
    documentId: payload.documentId,
    extractionId,
    actionItems: result.output.actionItems.length,
    inserted: insertedDeadlines,
  });
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.minutes-extract.system.user');

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
