import type { AuditLogEntryId, UserId } from './ids.js';

export type AuditAction =
  // Contract + summary + access
  | 'contract.create'
  | 'contract.update'
  | 'contract.lifecycle.transition'
  | 'contract_summary.create'
  | 'contract_summary.verify'
  | 'contract_access.grant'
  | 'contract_access.revoke'
  | 'contract_access.revocation.reverse'
  // Aliases, parties, users
  | 'email_alias.create'
  | 'email_alias.deactivate'
  | 'email_alias.rename'
  | 'party.create'
  | 'user.create'
  // Documents
  | 'document.upload'
  | 'document.version.create'
  | 'document.tag.add'
  | 'document.tag.remove'
  | 'document.malware_scan.clean'
  | 'document.malware_scan.quarantine'
  | 'document.ocr.complete'
  | 'document.ocr.failed'
  | 'document.decrypt'
  // Email pipeline
  | 'email.ingest.accept'
  | 'email.ingest.duplicate'
  | 'email.sender_trust.change'
  | 'email_review_queue.create'
  | 'email_review_queue.approve'
  | 'email_review_queue.reject'
  | 'email_review_queue.action'
  | 'shared_link_capture.create'
  | 'shared_link_capture.complete'
  | 'calendar_event.create'
  | 'calendar_event.promote'
  | 'inbound_email_event.receive'
  | 'inbound_email_event.fail'
  // Deadlines
  | 'deadline.extract'
  | 'deadline.create'
  | 'deadline.verify'
  | 'deadline.update'
  | 'deadline.transition'
  | 'deadline.complete'
  | 'deadline.cancel'
  // Clauses
  | 'clause.extract'
  | 'clause.verify'
  | 'clause_relationship.create'
  | 'clause_relationship.verify'
  // Contacts
  | 'contact.create'
  | 'contact.update'
  | 'contact.delete';

export type AuditEntityType =
  // Contract layer
  | 'Contract'
  | 'ContractSummary'
  | 'ContractAccess'
  | 'ContractAccessRevocation'
  // People / addressing
  | 'EmailAlias'
  | 'Party'
  | 'User'
  // Documents
  | 'Document'
  | 'DocumentVersion'
  | 'DocumentTag'
  | 'Tag'
  // Email pipeline
  | 'Email'
  | 'EmailThread'
  | 'SenderTrustEntry'
  | 'EmailReviewQueueItem'
  | 'SharedLinkCapture'
  | 'CalendarEvent'
  | 'InboundEmailEvent'
  | 'Deadline'
  | 'Clause'
  | 'ClauseRelationship'
  | 'ContractContact';

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
