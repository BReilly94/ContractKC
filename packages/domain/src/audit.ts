import type { AuditLogEntryId, UserId } from './ids.js';

export type AuditAction =
  | 'contract.create'
  | 'contract.update'
  | 'contract.lifecycle.transition'
  | 'contract_summary.create'
  | 'contract_summary.verify'
  | 'contract_access.grant'
  | 'contract_access.revoke'
  | 'contract_access.revocation.reverse'
  | 'email_alias.create'
  | 'email_alias.deactivate'
  | 'party.create'
  | 'user.create';

export type AuditEntityType =
  | 'Contract'
  | 'ContractSummary'
  | 'ContractAccess'
  | 'ContractAccessRevocation'
  | 'EmailAlias'
  | 'Party'
  | 'User';

export interface AuditLogEntry {
  readonly id: AuditLogEntryId;
  readonly actorUserId: UserId;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly correlationId: string;
  readonly createdAt: Date;
  readonly prevHash: string | null;
  readonly rowHash: string;
}
