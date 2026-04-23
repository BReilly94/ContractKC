import type { AuditAction, AuditEntityType } from '@ckb/domain';
import mssql from 'mssql';
import { computeRowHash } from './hash-chain.js';

export interface AuditQueryFilters {
  readonly entityType?: AuditEntityType;
  readonly entityId?: string;
  readonly action?: AuditAction;
  readonly correlationId?: string;
  readonly fromSequence?: number;
  readonly toSequence?: number;
  readonly limit?: number;
}

export interface AuditRow {
  readonly sequenceNumber: number;
  readonly id: string;
  readonly actorUserId: string;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly beforeJson: string | null;
  readonly afterJson: string | null;
  readonly correlationId: string;
  readonly createdAt: Date;
  readonly prevHash: string | null;
  readonly rowHash: string;
}

interface DbRow {
  readonly sequence_number: number | string;
  readonly id: string;
  readonly actor_user_id: string;
  readonly action: AuditAction;
  readonly entity_type: AuditEntityType;
  readonly entity_id: string;
  readonly before_json: string | null;
  readonly after_json: string | null;
  readonly correlation_id: string;
  readonly created_at: Date;
  readonly prev_hash: string | null;
  readonly row_hash: string;
}

function mapRow(r: DbRow): AuditRow {
  return {
    sequenceNumber: typeof r.sequence_number === 'string' ? Number(r.sequence_number) : r.sequence_number,
    id: r.id,
    actorUserId: r.actor_user_id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    beforeJson: r.before_json,
    afterJson: r.after_json,
    correlationId: r.correlation_id,
    createdAt: r.created_at,
    prevHash: r.prev_hash,
    rowHash: r.row_hash,
  };
}

export async function queryAuditLog(
  pool: mssql.ConnectionPool,
  filters: AuditQueryFilters = {},
): Promise<AuditRow[]> {
  const req = pool.request();
  const where: string[] = [];
  if (filters.entityType) {
    req.input('entity_type', mssql.VarChar(40), filters.entityType);
    where.push('entity_type = @entity_type');
  }
  if (filters.entityId) {
    req.input('entity_id', mssql.VarChar(64), filters.entityId);
    where.push('entity_id = @entity_id');
  }
  if (filters.action) {
    req.input('action', mssql.VarChar(64), filters.action);
    where.push('action = @action');
  }
  if (filters.correlationId) {
    req.input('correlation_id', mssql.Char(26), filters.correlationId);
    where.push('correlation_id = @correlation_id');
  }
  if (filters.fromSequence !== undefined) {
    req.input('from_seq', mssql.BigInt, filters.fromSequence);
    where.push('sequence_number >= @from_seq');
  }
  if (filters.toSequence !== undefined) {
    req.input('to_seq', mssql.BigInt, filters.toSequence);
    where.push('sequence_number <= @to_seq');
  }
  const limit = filters.limit ?? 500;
  req.input('limit', mssql.Int, limit);

  const sql = `
    SELECT TOP (@limit)
      sequence_number, id, actor_user_id, action, entity_type, entity_id,
      before_json, after_json, correlation_id, created_at, prev_hash, row_hash
    FROM audit_log
    ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY sequence_number ASC
  `;
  const result = await req.query<DbRow>(sql);
  return result.recordset.map(mapRow);
}

export interface ChainVerificationOk {
  readonly ok: true;
  readonly count: number;
}

export interface ChainVerificationFailure {
  readonly ok: false;
  readonly failedAtSequence: number;
  readonly reason:
    | 'HashMismatch'
    | 'PrevHashMismatch'
    | 'GapInSequence'
    | 'MissingHash';
}

export type ChainVerification = ChainVerificationOk | ChainVerificationFailure;

export async function verifyChain(
  pool: mssql.ConnectionPool,
  options: { fromSequence?: number; toSequence?: number } = {},
): Promise<ChainVerification> {
  const rows = await queryAuditLog(pool, {
    ...options,
    limit: 10_000,
  });
  let expectedPrev: string | null = null;
  let lastSequence: number | null = null;
  for (const row of rows) {
    if (lastSequence !== null && row.sequenceNumber !== lastSequence + 1) {
      return { ok: false, failedAtSequence: row.sequenceNumber, reason: 'GapInSequence' };
    }
    if (row.prevHash !== expectedPrev) {
      return { ok: false, failedAtSequence: row.sequenceNumber, reason: 'PrevHashMismatch' };
    }
    const recomputed = computeRowHash({
      id: row.id,
      actorUserId: row.actorUserId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      beforeJson: row.beforeJson,
      afterJson: row.afterJson,
      correlationId: row.correlationId,
      createdAt: row.createdAt,
      prevHash: row.prevHash,
    });
    if (recomputed !== row.rowHash) {
      return { ok: false, failedAtSequence: row.sequenceNumber, reason: 'HashMismatch' };
    }
    expectedPrev = row.rowHash;
    lastSequence = row.sequenceNumber;
  }
  return { ok: true, count: rows.length };
}
