import { runDeadlineExtract } from '@ckb/ai';
import { logAudit } from '@ckb/audit';
import { QUEUES } from '@ckb/queue';
import { HashEmbeddingProvider } from '@ckb/search';
import { asBrandedId, getCorrelationId, newUlid, runWithCorrelation, utcNow } from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * Deadline extraction worker (§5.5). Runs after clause/retrieval indexing has
 * populated the contract namespace. Pulls the top-K obligation-flavoured
 * chunks, hands to the deadline-extract capability, and inserts deadlines
 * as Unverified — downstream alerting requires a human verify step
 * (Non-Negotiable #2).
 */

export interface DeadlineExtractPayload {
  readonly contractId: string;
}

registerWorker<DeadlineExtractPayload>({
  queueName: QUEUES.deadlineExtract,
  concurrency: 1,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => extract(payload, ctx));
  },
});

async function extract(payload: DeadlineExtractPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  const systemUserId = await resolveSystemUserId(db);

  const contract = await db
    .request()
    .input('id', mssql.Char(26), payload.contractId)
    .query<{ name: string }>(`SELECT name FROM contract WHERE id = @id`);
  if (contract.recordset.length === 0) return;
  const contractName = contract.recordset[0]!.name;

  await clients.search.ensureNamespace(payload.contractId);
  const embedder = new HashEmbeddingProvider(clients.search.embeddingDim);
  const [qvec] = await embedder.embed(['notice period deadline within days obligation claim submit']);
  const retrievalReq = qvec
    ? {
        contractId: payload.contractId,
        query: 'notice period deadline within days obligation claim submit',
        queryVector: qvec,
        topK: 25,
      }
    : {
        contractId: payload.contractId,
        query: 'notice period deadline within days obligation claim submit',
        topK: 25,
      };
  const hits = await clients.search.hybridQuery(retrievalReq);
  if (hits.hits.length === 0) {
    logger.info('deadline-extract: no chunks retrieved', { contractId: payload.contractId });
    return;
  }

  const result = await runDeadlineExtract(clients.llm, {
    contractContext: contractName,
    chunks: hits.hits.map((h) => ({
      chunkId: h.chunkId,
      source: describeSource(h),
      text: h.text,
    })),
  });

  if (result.output.obligations.length === 0) {
    logger.info('deadline-extract: no obligations found', { contractId: payload.contractId });
    return;
  }

  const now = utcNow();
  const tx = new mssql.Transaction(db);
  await tx.begin();
  try {
    for (const ob of result.output.obligations) {
      const id = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), payload.contractId)
        .input('label', mssql.NVarChar(512), ob.label)
        .input('responsible_party', mssql.VarChar(24), ob.responsibleParty)
        .input('trigger_condition', mssql.NVarChar(1024), ob.triggerCondition)
        .input('duration_days', mssql.Int, ob.durationDays)
        .input('absolute_date', mssql.Date, ob.absoluteDate)
        .input('alert_lead_days', mssql.Int, ob.alertLeadDays)
        .input('consequence', mssql.NVarChar(1024), ob.consequence)
        .input('source_type', mssql.VarChar(24), 'Clause')
        .input('source_id', mssql.Char(26), null)
        .input('source_citation', mssql.NVarChar(256), ob.citation)
        .input('version', mssql.VarChar(64), `deadline-extract@${result.promptVersion}`)
        .input('system_user_id', mssql.Char(26), systemUserId)
        .input('now', mssql.DateTimeOffset, now)
        .query(`
          INSERT INTO deadline
            (id, contract_id, label, responsible_party, trigger_condition,
             duration_days, absolute_date, alert_lead_days, consequence,
             verification_state, lifecycle_state, source_type, source_id,
             source_citation, extracted_by_capability_version,
             created_by_user_id, created_at, updated_at)
          VALUES
            (@id, @contract_id, @label, @responsible_party, @trigger_condition,
             @duration_days, @absolute_date, @alert_lead_days, @consequence,
             'Unverified', 'Extracted', @source_type, @source_id,
             @source_citation, @version, @system_user_id, @now, @now);
        `);
      await logAudit(tx, {
        actorUserId: asBrandedId<'User'>(systemUserId),
        action: 'deadline.extract',
        entityType: 'Deadline',
        entityId: id,
        after: {
          contractId: payload.contractId,
          label: ob.label,
          durationDays: ob.durationDays,
          citation: ob.citation,
        },
        correlationId: getCorrelationId() ?? newUlid(),
      });
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  logger.info('deadline-extract: inserted obligations (Unverified)', {
    contractId: payload.contractId,
    count: result.output.obligations.length,
  });
}

function describeSource(hit: { source: { type: string; id: string } }): string {
  return `${hit.source.type} ${hit.source.id}`;
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.deadline.system.user');

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
