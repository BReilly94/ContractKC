import { logAudit } from '@ckb/audit';
import { ErpFetchError } from '@ckb/erp';
import { asBrandedId, getCorrelationId, newUlid, runWithCorrelation, utcNow } from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * ERP refresh worker (Slice Z, §6.14 item 2).
 *
 * Scheduled pull from the configured ERP client. Writes a new `erp_snapshot`
 * row with `last_refreshed_by_system='scheduler'`. Manual-mode clients
 * short-circuit — no snapshot is written, the run is logged at info level.
 *
 * Cost shape: small per-contract payloads (approved value + approved
 * variation list). Run once daily per active contract via a cron-style
 * enqueue from the API or an external scheduler.
 */

export interface ErpRefreshPayload {
  readonly contractId: string;
  readonly externalRef?: string | undefined;
}

const ERP_REFRESH_QUEUE = 'erp.refresh.v1';

registerWorker<ErpRefreshPayload>({
  queueName: ERP_REFRESH_QUEUE,
  concurrency: 2,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => refresh(payload, ctx));
  },
});

async function refresh(payload: ErpRefreshPayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  if (clients.erp.sourceSystem === 'Manual') {
    logger.info('erp-refresh: manual-mode client, skipping', { contractId: payload.contractId });
    return;
  }

  let fetched;
  try {
    fetched = await clients.erp.fetchContractSnapshot(payload.contractId, payload.externalRef);
  } catch (err) {
    if (err instanceof ErpFetchError) {
      logger.warn('erp-refresh: fetch failed', {
        contractId: payload.contractId,
        code: err.code,
        message: err.message,
      });
      return;
    }
    throw err;
  }

  const id = newUlid();
  const tx = new mssql.Transaction(db);
  await tx.begin();
  try {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), id)
      .input('contract_id', mssql.Char(26), payload.contractId)
      .input('taken_at', mssql.DateTimeOffset, utcNow())
      .input('approved_contract_value_cents', mssql.BigInt, fetched.approvedContractValueCents)
      .input('approved_variations', mssql.NVarChar(mssql.MAX), JSON.stringify(fetched.approvedVariations))
      .input('source_system', mssql.VarChar(40), fetched.sourceSystem)
      .input('currency', mssql.Char(3), fetched.currency)
      .input('last_refreshed_by_user_id', mssql.Char(26), null)
      .input('last_refreshed_by_system', mssql.VarChar(40), 'scheduler')
      .input('notes', mssql.NVarChar(mssql.MAX), fetched.notes)
      .query(`
        INSERT INTO erp_snapshot
          (id, contract_id, taken_at, approved_contract_value_cents,
           approved_variations, source_system, currency,
           last_refreshed_by_user_id, last_refreshed_by_system, notes)
        VALUES
          (@id, @contract_id, @taken_at, @approved_contract_value_cents,
           @approved_variations, @source_system, @currency,
           @last_refreshed_by_user_id, @last_refreshed_by_system, @notes);
      `);
    const systemUserId = await resolveSystemUserId(db);
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: 'erp.refresh',
      entityType: 'ErpSnapshot',
      entityId: id,
      after: {
        contractId: payload.contractId,
        sourceSystem: fetched.sourceSystem,
        approvedContractValueCents: fetched.approvedContractValueCents,
        variationCount: fetched.approvedVariations.length,
        via: 'scheduler',
      },
      correlationId: getCorrelationId() ?? newUlid(),
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  logger.info('erp-refresh: snapshot written', {
    contractId: payload.contractId,
    sourceSystem: fetched.sourceSystem,
  });
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.erp.system.user');

async function resolveSystemUserId(pool: mssql.ConnectionPool): Promise<string> {
  const cache = globalThis as unknown as Record<symbol, string | undefined>;
  if (cache[SYSTEM_USER_CACHE]) return cache[SYSTEM_USER_CACHE]!;
  const r = await pool.request().query<{ id: string }>(
    `SELECT TOP 1 id FROM app_user
      WHERE global_role IN ('SystemAdministrator','KnowledgeCentreAdministrator')
      ORDER BY created_at ASC`,
  );
  const id = r.recordset[0]?.id;
  if (!id) throw new Error('No SystemAdministrator/KnowledgeCentreAdministrator user');
  cache[SYSTEM_USER_CACHE] = id;
  return id;
}

export { ERP_REFRESH_QUEUE };
