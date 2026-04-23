import { sha256 } from '@ckb/shared';
import type { AuditAction, AuditEntityType } from '@ckb/domain';

export interface HashableRow {
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
}

export function canonicalEncoding(row: HashableRow): string {
  return JSON.stringify({
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
    prevHash: row.prevHash,
  });
}

export function computeRowHash(row: HashableRow): string {
  return sha256(canonicalEncoding(row));
}
