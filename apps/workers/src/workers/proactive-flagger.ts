import {
  runProactiveFlagDeepReview,
  runProactiveFlagFirstPass,
} from '@ckb/ai';
import { logAudit } from '@ckb/audit';
import type { FlagSensitivityProfile, ProactiveFlagTriggerType } from '@ckb/domain';
import { QUEUES } from '@ckb/queue';
import { HashEmbeddingProvider } from '@ckb/search';
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
 * Proactive Flagging worker (Slice GG, §6.15, §7.10).
 *
 * Two-tier per §7.10:
 *  1. Sonnet first-pass classifier — decides "worth deep review?".
 *  2. Opus deep-review on candidates — full retrieval + mandatory
 *     citations. Flags failing citation verification are logged as
 *     AI quality incidents and NOT persisted (Non-Negotiable #1).
 *
 * Per-contract daily budget (`contract.daily_flag_budget`): when
 * exceeded, the pipeline raises a notification to the
 * KnowledgeCentreAdministrator and records a `flag_budget.alert`
 * audit entry. It NEVER silently throttles.
 */

export interface ProactiveFlagPayload {
  readonly contractId: string;
  readonly triggerEventType: ProactiveFlagTriggerType;
  readonly triggerEventId: string;
  readonly triggerSummary: string;
  readonly triggerExcerpt: string;
  readonly sensitivity?: FlagSensitivityProfile;
}

registerWorker<ProactiveFlagPayload>({
  queueName: QUEUES.proactiveFlag,
  concurrency: 1,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => runFlag(payload, ctx));
  },
});

async function runFlag(payload: ProactiveFlagPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  const systemUserId = await resolveSystemUserId(db);
  const sensitivity: FlagSensitivityProfile = payload.sensitivity ?? 'Standard';

  const contractRow = await db
    .request()
    .input('id', mssql.Char(26), payload.contractId)
    .query<{ name: string; daily_flag_budget: number }>(`
      SELECT name, daily_flag_budget FROM contract WHERE id = @id
    `);
  const contract = contractRow.recordset[0];
  if (!contract) {
    logger.warn('proactive-flag: contract missing', { contractId: payload.contractId });
    return;
  }

  // ---- 1. First-pass classifier (Sonnet). ----
  const firstPass = await runProactiveFlagFirstPass(clients.llm, {
    contractContext: contract.name,
    triggerEventType: payload.triggerEventType,
    triggerSummary: payload.triggerSummary,
    triggerExcerpt: payload.triggerExcerpt.slice(0, 16_000),
    sensitivity,
  });
  if (!firstPass.output.candidate) {
    logger.info('proactive-flag: first-pass declined', {
      contractId: payload.contractId,
      triggerEventType: payload.triggerEventType,
      triggerEventId: payload.triggerEventId,
    });
    return;
  }

  // ---- 2. Budget check BEFORE spending Opus tokens. ----
  const today = new Date(utcNow().toISOString().slice(0, 10));
  const countRow = await db
    .request()
    .input('contract_id', mssql.Char(26), payload.contractId)
    .input('start_of_day', mssql.DateTimeOffset, `${today.toISOString().slice(0, 10)}T00:00:00Z`)
    .query<{ n: number }>(`
      SELECT COUNT(*) AS n FROM proactive_flag
       WHERE contract_id = @contract_id AND created_at >= @start_of_day
    `);
  const todayCount = countRow.recordset[0]?.n ?? 0;
  if (todayCount >= contract.daily_flag_budget) {
    await alertBudgetExceeded(
      db,
      logger,
      clients,
      payload.contractId,
      today,
      contract.daily_flag_budget,
      todayCount,
      systemUserId,
    );
    return;
  }

  // ---- 3. Retrieval. Contract-scoped only (NN #6). ----
  await clients.search.ensureNamespace(payload.contractId);
  const embedder = new HashEmbeddingProvider(clients.search.embeddingDim);
  const queryText = [
    payload.triggerSummary,
    payload.triggerExcerpt.slice(0, 2000),
  ].join(' ');
  const [qvec] = await embedder.embed([queryText]);
  const retrievalReq = qvec
    ? {
        contractId: payload.contractId,
        query: queryText,
        queryVector: qvec,
        topK: 10,
      }
    : {
        contractId: payload.contractId,
        query: queryText,
        topK: 10,
      };
  const hits = await clients.search.hybridQuery(retrievalReq);
  if (hits.hits.length === 0) {
    logger.info('proactive-flag: no retrieval hits — skipping deep review', {
      contractId: payload.contractId,
      triggerEventId: payload.triggerEventId,
    });
    return;
  }

  // ---- 4. Deep review (Opus) + citation verification (NN #1). ----
  const deep = await runProactiveFlagDeepReview(clients.llm, {
    contractContext: contract.name,
    triggerEventType: payload.triggerEventType,
    triggerSummary: payload.triggerSummary,
    triggerExcerpt: payload.triggerExcerpt.slice(0, 16_000),
    flagKindHint: firstPass.output.flagKindHint,
    chunks: hits.hits.map((h) => ({
      chunkId: h.chunkId,
      source: describeSource(h),
      text: h.text,
    })),
  });

  if (!deep.raised) {
    // Either the model declined or verification blocked the flag.
    const reason = deep.blockedReason ?? 'deep-review declined';
    logger.warn('proactive-flag: NOT raised', {
      contractId: payload.contractId,
      triggerEventId: payload.triggerEventId,
      reason,
      citationIssue: deep.verification.ok ? null : deep.verification.reason,
    });
    if (!deep.verification.ok) {
      // AI quality incident — logged but not surfaced as a flag.
      logger.warn('proactive-flag: citation verification FAILED — logged as quality incident', {
        contractId: payload.contractId,
        triggerEventId: payload.triggerEventId,
        verification: deep.verification,
      });
    }
    return;
  }

  // ---- 5. Persist the flag + audit + notification. ----
  if (deep.output.flagKind === null) {
    logger.warn('proactive-flag: raise=true but flagKind null, skipping', {
      contractId: payload.contractId,
    });
    return;
  }

  const flagId = newUlid();
  const tx = new mssql.Transaction(db);
  await tx.begin();
  try {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), flagId)
      .input('contract_id', mssql.Char(26), payload.contractId)
      .input('trigger_event_type', mssql.VarChar(24), payload.triggerEventType)
      .input('trigger_event_id', mssql.Char(26), payload.triggerEventId)
      .input('flag_kind', mssql.VarChar(32), deep.output.flagKind)
      .input('reasoning', mssql.NVarChar(mssql.MAX), deep.output.reasoning)
      .input('cited_clause_ids', mssql.NVarChar(mssql.MAX), JSON.stringify(deep.output.citedClauseIds))
      .input('cited_chunk_ids', mssql.NVarChar(mssql.MAX), JSON.stringify(deep.citedChunkIds))
      .input('recommended_action', mssql.NVarChar(1024), deep.output.recommendedAction)
      .input('first_pass_model', mssql.VarChar(32), firstPass.model)
      .input('deep_review_model', mssql.VarChar(32), deep.model)
      .input('sensitivity_profile', mssql.VarChar(16), sensitivity)
      .query(`
        INSERT INTO proactive_flag
          (id, contract_id, trigger_event_type, trigger_event_id, flag_kind,
           reasoning, cited_clause_ids, cited_chunk_ids, recommended_action,
           status, first_pass_model, deep_review_model, sensitivity_profile)
        VALUES
          (@id, @contract_id, @trigger_event_type, @trigger_event_id, @flag_kind,
           @reasoning, @cited_clause_ids, @cited_chunk_ids, @recommended_action,
           'New', @first_pass_model, @deep_review_model, @sensitivity_profile);
      `);
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: 'proactive_flag.raise',
      entityType: 'ProactiveFlag',
      entityId: flagId,
      after: {
        contractId: payload.contractId,
        triggerEventType: payload.triggerEventType,
        triggerEventId: payload.triggerEventId,
        flagKind: deep.output.flagKind,
        citedChunkCount: deep.citedChunkIds.length,
      },
      correlationId: getCorrelationId() ?? newUlid(),
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  logger.info('proactive-flag: raised', {
    flagId,
    contractId: payload.contractId,
    flagKind: deep.output.flagKind,
    citedChunkCount: deep.citedChunkIds.length,
  });

  // Per-event notification to the contract owner — surfaces the flag.
  await clients.queue.enqueue(
    QUEUES.notify,
    {
      contractId: payload.contractId,
      kind: 'proactive_flag_raised',
      subject: `New AI flag: ${deep.output.flagKind}`,
      body: deep.output.recommendedAction,
      linkPath: `/contracts/${payload.contractId}/flags/${flagId}`,
    },
    { jobId: `notify_pflag_${flagId}` },
  );
}

function describeSource(hit: {
  source: {
    type: string;
    id: string;
    pageStart?: number;
    clauseNumber?: string;
  };
}): string {
  const s = hit.source;
  if (s.clauseNumber) return `${s.type} ${s.clauseNumber}`;
  return `${s.type} ${s.id}${s.pageStart ? ` p.${s.pageStart}` : ''}`;
}

async function alertBudgetExceeded(
  db: mssql.ConnectionPool,
  logger: WorkerContext['logger'],
  clients: WorkerContext['clients'],
  contractId: string,
  utcDay: Date,
  budget: number,
  observed: number,
  systemUserId: string,
): Promise<void> {
  // Find the KnowledgeCentreAdministrator user to alert (the SOW
  // prescribes admin notification, not contract-local roles).
  const adminRow = await db
    .request()
    .query<{ id: string }>(`
      SELECT TOP 1 id FROM app_user
       WHERE global_role = 'KnowledgeCentreAdministrator'
       ORDER BY created_at ASC
    `);
  const alertUserId = adminRow.recordset[0]?.id ?? systemUserId;

  const alertId = newUlid();
  const tx = new mssql.Transaction(db);
  await tx.begin();
  try {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), alertId)
      .input('contract_id', mssql.Char(26), contractId)
      .input('utc_day', mssql.Date, utcDay)
      .input('budget', mssql.Int, budget)
      .input('observed_count', mssql.Int, observed)
      .input('alerted_user_id', mssql.Char(26), alertUserId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM flag_budget_alert WHERE contract_id = @contract_id AND utc_day = @utc_day)
          INSERT INTO flag_budget_alert
            (id, contract_id, utc_day, budget, observed_count, alerted_user_id)
          VALUES (@id, @contract_id, @utc_day, @budget, @observed_count, @alerted_user_id);
      `);
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: 'flag_budget.alert',
      entityType: 'FlagBudget',
      entityId: alertId,
      after: { contractId, utcDay: utcDay.toISOString().slice(0, 10), budget, observed },
      correlationId: getCorrelationId() ?? newUlid(),
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  await clients.queue.enqueue(
    QUEUES.notify,
    {
      contractId,
      userId: alertUserId,
      kind: 'flag_budget_exceeded',
      subject: 'Proactive flag budget exceeded',
      body: `Today's flag count (${observed}) has met or exceeded the daily budget (${budget}). Raising the budget is configurable on the contract.`,
      linkPath: `/contracts/${contractId}/flags`,
    },
    { jobId: `notify_fbudget_${contractId}_${utcDay.toISOString().slice(0, 10)}` },
  );

  logger.warn('proactive-flag: daily budget exceeded — alerting admin, not throttling', {
    contractId,
    budget,
    observed,
  });
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.proactive-flag.system.user');

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
