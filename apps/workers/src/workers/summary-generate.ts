import { runContractSummary } from '@ckb/ai';
import { HashEmbeddingProvider } from '@ckb/search';
import { logAudit } from '@ckb/audit';
import { QUEUES } from '@ckb/queue';
import { asBrandedId, getCorrelationId, newUlid, runWithCorrelation } from '@ckb/shared';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * Summary generation worker (§5.4). Generates the cheat-sheet via the
 * contract-summary capability and writes the structured content to
 * contract_summary.content_json. Emits as Unverified — Non-Negotiable #2
 * means it cannot be treated as trusted until a human approves.
 */

export interface SummaryGeneratePayload {
  readonly contractId: string;
}

registerWorker<SummaryGeneratePayload>({
  queueName: QUEUES.summaryGenerate,
  concurrency: 1,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => generate(payload, ctx));
  },
});

async function generate(payload: SummaryGeneratePayload, ctx: WorkerContext): Promise<void> {
  const { clients, db, logger } = ctx;
  const systemUserId = await resolveSystemUserId(db);

  const contractRow = await db
    .request()
    .input('id', mssql.Char(26), payload.contractId)
    .query<{
      name: string;
      client_party_id: string;
      client_name: string;
      summary_id: string | null;
    }>(`
      SELECT c.name, c.client_party_id, p.name AS client_name, c.summary_id
        FROM contract c
        JOIN party p ON p.id = c.client_party_id
       WHERE c.id = @id
    `);
  const contract = contractRow.recordset[0];
  if (!contract) {
    logger.warn('summary-generate: contract not found', { contractId: payload.contractId });
    return;
  }

  // Retrieve MasterAgreement + Schedule chunks from the contract-isolated index.
  await clients.search.ensureNamespace(payload.contractId);
  const embedder = new HashEmbeddingProvider(clients.search.embeddingDim);
  const [qvec] = await embedder.embed([`${contract.name} ${contract.client_name} parties value term notice periods liquidated damages governing law`]);
  const retrievalReq = qvec
    ? {
        contractId: payload.contractId,
        query: 'contract summary overview parties value term notice damages termination governing law',
        queryVector: qvec,
        topK: 20,
      }
    : {
        contractId: payload.contractId,
        query: 'contract summary overview parties value term notice damages termination governing law',
        topK: 20,
      };
  const hits = await clients.search.hybridQuery(retrievalReq);

  if (hits.hits.length === 0) {
    logger.warn('summary-generate: no chunks retrieved, skipping', {
      contractId: payload.contractId,
    });
    return;
  }

  const result = await runContractSummary(clients.llm, {
    contractName: contract.name,
    clientName: contract.client_name,
    chunks: hits.hits.map((h) => ({
      chunkId: h.chunkId,
      source: describeSource(h),
      text: h.text,
    })),
  });

  const summaryId = contract.summary_id ?? newUlid();
  const tx = new mssql.Transaction(db);
  await tx.begin();
  try {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), summaryId)
      .input('contract_id', mssql.Char(26), payload.contractId)
      .input('content_json', mssql.NVarChar(mssql.MAX), JSON.stringify(result.output))
      .input('version', mssql.VarChar(64), `contract-summary@${result.promptVersion}`)
      .query(`
        IF EXISTS (SELECT 1 FROM contract_summary WHERE id = @id)
          UPDATE contract_summary
             SET content_json = @content_json,
                 verification_state = 'Unverified',
                 verified_by_user_id = NULL,
                 verified_at = NULL,
                 generated_by_capability_version = @version,
                 generated_at = SYSDATETIMEOFFSET()
           WHERE id = @id;
        ELSE
          INSERT INTO contract_summary
            (id, contract_id, verification_state, content_json,
             generated_by_capability_version, generated_at)
          VALUES
            (@id, @contract_id, 'Unverified', @content_json,
             @version, SYSDATETIMEOFFSET());
      `);
    // Ensure contract.summary_id points at this summary.
    await new mssql.Request(tx)
      .input('contract_id', mssql.Char(26), payload.contractId)
      .input('summary_id', mssql.Char(26), summaryId)
      .query(
        `UPDATE contract SET summary_id = @summary_id, updated_at = SYSDATETIMEOFFSET() WHERE id = @contract_id;`,
      );
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: 'contract_summary.create',
      entityType: 'ContractSummary',
      entityId: summaryId,
      after: {
        contractId: payload.contractId,
        verificationState: 'Unverified',
        capabilityVersion: result.promptVersion,
        citedChunkCount: result.citedChunkIds.length,
      },
      correlationId: getCorrelationId() ?? newUlid(),
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  logger.info('summary generated (Unverified — Non-Negotiable #2)', {
    contractId: payload.contractId,
    summaryId,
    citedChunkCount: result.citedChunkIds.length,
  });
}

function describeSource(hit: { source: { type: string; id: string; pageStart?: number } }): string {
  const s = hit.source;
  return `${s.type} ${s.id}${s.pageStart ? ` p.${s.pageStart}` : ''}`;
}

const SYSTEM_USER_CACHE = Symbol.for('ckb.summary.system.user');

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
