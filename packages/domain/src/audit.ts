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
  | 'contact.delete'
  // Exports
  | 'export.request'
  | 'export.complete'
  | 'export.fail'
  | 'export.download'
  // Phase 2 — register lifecycles
  | 'claim.create'
  | 'claim.update'
  | 'claim.lifecycle.transition'
  | 'variation.create'
  | 'variation.update'
  | 'variation.lifecycle.transition'
  | 'rfi.create'
  | 'rfi.update'
  | 'rfi.lifecycle.transition'
  | 'submittal.create'
  | 'submittal.update'
  | 'submittal.lifecycle.transition'
  // Phase 2 — register link actions
  | 'variation.link'
  | 'variation.unlink'
  // Phase 2 — redactions
  | 'redaction.apply'
  | 'redaction.reverse'
  // Phase 2 — risk + interpretation
  | 'risk.create'
  | 'risk.update'
  | 'risk.delete'
  | 'interpretation.create'
  | 'interpretation.update'
  | 'interpretation.delete'
  // Phase 2 — operational registers
  | 'submittal.link'
  | 'payment_application.create'
  | 'payment_application.update'
  | 'payment_application.transition'
  | 'policy.create'
  | 'policy.update'
  | 'policy.delete'
  // Phase 2 — diary
  | 'diary.create'
  | 'diary.update'
  | 'diary.conflict.record'
  | 'diary.conflict.reconcile'
  // Phase 2 — record flags
  | 'record_flag.create'
  | 'record_flag.update'
  | 'record_flag.delete'
  | 'record_flag.hold_point.release'
  // Phase 2 — closeout (Slice HH, §6.21)
  | 'closeout_template.create'
  | 'closeout.checklist.create'
  | 'closeout.item.sign'
  | 'closeout.item.waive'
  | 'closeout.certificate.generate'
  // Phase 2 — configurable digest (Slice II, §6.23)
  | 'digest_preference.update'
  | 'digest.send'
  // Phase 2 — auditor export (Slice JJ, §5.11 carry-forward)
  | 'audit.export.request'
  | 'audit.export.complete'
  // Phase 2 — outbound correspondence (Slice W, §3.19, §6.16, NN #10)
  | 'correspondence_template.create'
  | 'correspondence_template.update'
  | 'outbound_correspondence.draft'
  | 'outbound_correspondence.send'
  | 'outbound_correspondence.send_failed'
  | 'outbound_correspondence.recall'
  // Phase 2 — Drawing Comparison (Slice AA, §6.17)
  | 'drawing_diff.compute'
  | 'drawing_diff.flag_raised'
  // Phase 2 — Meeting Minutes Ingestion (Slice BB, §6.19)
  | 'minutes.extract'
  | 'minutes.action_item.create'
  // Phase 2 — Proactive AI Flagging (Slice GG, §6.15, §7.10)
  | 'proactive_flag.raise'
  | 'proactive_flag.action'
  | 'proactive_flag.dismiss'
  | 'proactive_flag.escalate'
  | 'flag_budget.alert'
  // Phase 2 — bid handoff (Slice Y, §6.1, §7.7)
  | 'bid_handoff.receive'
  | 'bid_handoff.replay'
  // Phase 2 — ERP linkage (Slice Z, §6.14, §7.8)
  | 'erp.refresh'
  | 'erp.manual_entry'
  // Phase 2 — evidence packaging (Slice DD, §3.37)
  | 'evidence_bundle.create'
  | 'evidence_bundle.build'
  | 'evidence_bundle.artifact.add'
  | 'evidence_bundle.artifact.remove'
  | 'evidence_bundle.submitted_externally'
  | 'evidence_bundle.lock';

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
  | 'ContractContact'
  | 'ExportJob'
  // Phase 2
  | 'Claim'
  | 'Variation'
  | 'Rfi'
  | 'Submittal'
  | 'Redaction'
  | 'Risk'
  | 'Interpretation'
  | 'PaymentApplication'
  | 'Policy'
  | 'SiteDiaryEntry'
  | 'RecordFlag'
  // Phase 2 additions
  | 'CloseoutTemplate'
  | 'CloseoutChecklist'
  | 'CloseoutChecklistItem'
  | 'DigestPreference'
  | 'AuditExport'
  // Slice W — outbound correspondence
  | 'CorrespondenceTemplate'
  | 'OutboundCorrespondence'
  // Slice DD — Evidence Packaging (§3.37, §6.11)
  | 'EvidenceBundle'
  | 'EvidenceBundleArtifact'
  // Slice AA — Drawing Comparison (§6.17)
  | 'DrawingDiff'
  // Slice BB — Meeting Minutes Ingestion (§6.19)
  | 'MeetingMinutesExtraction'
  // Slice GG — Proactive AI Flagging (§6.15, §7.10)
  | 'ProactiveFlag'
  | 'FlagBudget'
  // Slice Y — Bid-to-Contract Handoff (§6.1, §7.7)
  | 'BidHandoff'
  // Slice Z — ERP read-only linkage (§6.14, §7.8)
  | 'ErpSnapshot';

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
