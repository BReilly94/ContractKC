import type { AuditAction, AuditEntityType, UserId } from '@ckb/domain';
import { asBrandedId, newUlid, requireCorrelationId, utcNow } from '@ckb/shared';
import mssql from 'mssql';
import { computeRowHash } from './hash-chain.js';

export interface LogInput {
  readonly actorUserId: UserId;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
  readonly correlationId?: string;
}

export interface LoggedEntry {
  readonly id: string;
  readonly prevHash: string | null;
  readonly rowHash: string;
  readonly createdAt: Date;
}

function stableStringify(value: Record<string, unknown> | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const keys = Object.keys(value).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = value[k];
  return JSON.stringify(ordered);
}

export async function logAudit(
  tx: mssql.Transaction,
  input: LogInput,
): Promise<LoggedEntry> {
  const correlationId = input.correlationId ?? requireCorrelationId();
  const prevResult = await new mssql.Request(tx).query<{ row_hash: string }>(`
    SELECT TOP 1 row_hash
    FROM audit_log WITH (UPDLOCK, HOLDLOCK)
    ORDER BY sequence_number DESC
  `);
  const prevHash = prevResult.recordset[0]?.row_hash ?? null;

  const id = newUlid();
  const createdAt = utcNow();
  const beforeJson = stableStringify(input.before ?? null);
  const afterJson = stableStringify(input.after ?? null);

  const rowHash = computeRowHash({
    id,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeJson,
    afterJson,
    correlationId,
    createdAt,
    prevHash,
  });

  await new mssql.Request(tx)
    .input('id', mssql.Char(26), id)
    .input('actor_user_id', mssql.Char(26), input.actorUserId)
    .input('action', mssql.VarChar(64), input.action)
    .input('entity_type', mssql.VarChar(40), input.entityType)
    .input('entity_id', mssql.VarChar(64), input.entityId)
    .input('before_json', mssql.NVarChar(mssql.MAX), beforeJson)
    .input('after_json', mssql.NVarChar(mssql.MAX), afterJson)
    .input('correlation_id', mssql.Char(26), correlationId)
    .input('created_at', mssql.DateTimeOffset, createdAt)
    .input('prev_hash', mssql.Char(64), prevHash)
    .input('row_hash', mssql.Char(64), rowHash)
    .query(`
      INSERT INTO audit_log
        (id, actor_user_id, action, entity_type, entity_id,
         before_json, after_json, correlation_id, created_at, prev_hash, row_hash)
      VALUES
        (@id, @actor_user_id, @action, @entity_type, @entity_id,
         @before_json, @after_json, @correlation_id, @created_at, @prev_hash, @row_hash);
    `);

  return { id, prevHash, rowHash, createdAt };
}

export { asBrandedId };
