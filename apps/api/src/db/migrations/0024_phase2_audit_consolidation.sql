-- Migration: 0024_phase2_audit_consolidation
-- Scope: Consolidates the `audit_log` CHECK-constraint whitelists for all
--        Phase 2 action names and entity types into a single authoritative
--        ADD after every Phase 2 slice has landed its own migration.
--
-- Why: Phase 2 migrations 0016–0023 were written in parallel by multiple
-- slice streams. Each extends the whitelist via DROP/ADD, but the order
-- of application (alphabetical sort) can leave the final constraint out
-- of sync with the TypeScript `AuditAction` / `AuditEntityType` unions
-- in `packages/domain/src/audit.ts`. This migration rewrites both
-- constraints to mirror the union exactly.
--
-- Source of truth: `packages/domain/src/audit.ts`. If this drifts, update
-- the union first, then regenerate this migration.

ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_entity_type;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_entity_type CHECK (
  entity_type IN (
    -- Phase 1 core
    'Contract','ContractSummary','ContractAccess','ContractAccessRevocation',
    'EmailAlias','Party','User',
    'Document','DocumentVersion','DocumentTag','Tag',
    'Email','EmailThread','SenderTrustEntry',
    'EmailReviewQueueItem','SharedLinkCapture','CalendarEvent',
    'InboundEmailEvent',
    'Deadline',
    'Clause','ClauseRelationship',
    'ContractContact',
    'ExportJob',
    -- Phase 2 lifecycle registers + access
    'Claim','Variation','Rfi','Submittal',
    'Redaction',
    'Risk','Interpretation',
    'PaymentApplication','Policy',
    'SiteDiaryEntry','RecordFlag',
    -- Phase 2 closeout / digest / auditor UI
    'CloseoutTemplate','CloseoutChecklist','CloseoutChecklistItem',
    'DigestPreference','AuditExport',
    -- Phase 2 outbound correspondence (NN #10)
    'CorrespondenceTemplate','OutboundCorrespondence',
    -- Phase 2 evidence packaging (core ROI)
    'EvidenceBundle','EvidenceBundleArtifact',
    -- Phase 2 AI capability artifacts
    'DrawingDiff','MeetingMinutesExtraction',
    'ProactiveFlag','FlagBudget',
    -- Phase 2 integrations
    'BidHandoff','ErpSnapshot'
  )
);

ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_action;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_action CHECK (
  action IN (
    -- Phase 1 core
    'contract.create','contract.update','contract.lifecycle.transition',
    'contract_summary.create','contract_summary.verify',
    'contract_access.grant','contract_access.revoke','contract_access.revocation.reverse',
    'email_alias.create','email_alias.deactivate','email_alias.rename',
    'party.create','user.create',
    'document.upload','document.version.create',
    'document.tag.add','document.tag.remove',
    'document.malware_scan.clean','document.malware_scan.quarantine',
    'document.ocr.complete','document.ocr.failed','document.decrypt',
    'email.ingest.accept','email.ingest.duplicate','email.sender_trust.change',
    'email_review_queue.create','email_review_queue.approve','email_review_queue.reject','email_review_queue.action',
    'shared_link_capture.create','shared_link_capture.complete',
    'calendar_event.create','calendar_event.promote',
    'inbound_email_event.receive','inbound_email_event.fail',
    'deadline.extract','deadline.create','deadline.verify','deadline.update','deadline.transition','deadline.complete','deadline.cancel',
    'clause.extract','clause.verify','clause_relationship.create','clause_relationship.verify',
    'contact.create','contact.update','contact.delete',
    'export.request','export.complete','export.fail','export.download',
    -- Phase 2 register lifecycles
    'claim.create','claim.update','claim.lifecycle.transition',
    'variation.create','variation.update','variation.lifecycle.transition',
    'variation.link','variation.unlink',
    'rfi.create','rfi.update','rfi.lifecycle.transition',
    'submittal.create','submittal.update','submittal.lifecycle.transition','submittal.link',
    -- Phase 2 redactions + risk + interpretation
    'redaction.apply','redaction.reverse',
    'risk.create','risk.update','risk.delete',
    'interpretation.create','interpretation.update','interpretation.delete',
    -- Phase 2 operational registers
    'payment_application.create','payment_application.update','payment_application.transition',
    'policy.create','policy.update','policy.delete',
    -- Phase 2 diary + safety flags
    'diary.create','diary.update','diary.conflict.record','diary.conflict.reconcile',
    'record_flag.create','record_flag.update','record_flag.delete','record_flag.hold_point.release',
    -- Phase 2 closeout / digest / auditor UI
    'closeout_template.create','closeout.checklist.create','closeout.item.sign','closeout.item.waive','closeout.certificate.generate',
    'digest_preference.update','digest.send',
    'audit.export.request','audit.export.complete',
    -- Phase 2 outbound correspondence (NN #10)
    'correspondence_template.create','correspondence_template.update',
    'outbound_correspondence.draft','outbound_correspondence.send','outbound_correspondence.send_failed','outbound_correspondence.recall',
    -- Phase 2 evidence packaging
    'evidence_bundle.create','evidence_bundle.build',
    'evidence_bundle.artifact.add','evidence_bundle.artifact.remove',
    'evidence_bundle.submitted_externally','evidence_bundle.lock',
    -- Phase 2 AI capability events
    'drawing_diff.compute','drawing_diff.flag_raised',
    'minutes.extract','minutes.action_item.create',
    'proactive_flag.raise','proactive_flag.action','proactive_flag.dismiss','proactive_flag.escalate',
    'flag_budget.alert',
    -- Phase 2 integrations
    'bid_handoff.receive','bid_handoff.replay',
    'erp.refresh','erp.manual_entry'
  )
);
