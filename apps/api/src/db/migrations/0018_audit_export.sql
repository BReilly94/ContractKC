-- Migration: 0018_audit_export
-- Scope: Slice JJ — §5.11 Auditor Export (Phase 1 carry-forward).
--
-- The append-only audit_log itself is untouched. This table records each
-- Auditor export request so the act of exporting is itself auditable
-- (security.md §8: the chain covers the export events too).

CREATE TABLE audit_export_job (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  requested_by_user_id    CHAR(26)        NOT NULL,
  from_at                 DATETIMEOFFSET  NULL,
  to_at                   DATETIMEOFFSET  NULL,
  entity_type_filter      VARCHAR(40)     NULL,
  user_id_filter          CHAR(26)        NULL,
  action_filter           VARCHAR(64)     NULL,
  row_count               INT             NULL,
  state                   VARCHAR(16)     NOT NULL DEFAULT 'Pending',
  error_message           NVARCHAR(MAX)   NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  completed_at            DATETIMEOFFSET  NULL,
  CONSTRAINT fk_audit_export_requester
    FOREIGN KEY (requested_by_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_audit_export_user_filter
    FOREIGN KEY (user_id_filter) REFERENCES app_user(id),
  CONSTRAINT ck_audit_export_state CHECK (
    state IN ('Pending','Succeeded','Failed')
  )
);

CREATE INDEX ix_audit_export_requester ON audit_export_job(requested_by_user_id, created_at DESC);

-- Extend audit_log constraints with the Auditor-export actions + entity.
ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_entity_type;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_entity_type CHECK (
  entity_type IN (
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
    'Claim','Variation','Rfi','Submittal',
    'Redaction',
    'Risk','Interpretation',
    'PaymentApplication','Policy',
    'SiteDiaryEntry',
    'RecordFlag',
    'CorrespondenceTemplate','OutboundCorrespondence',
    'CloseoutTemplate','CloseoutChecklist','CloseoutChecklistItem',
    'DigestPreference',
    'AuditExport'
  )
);

ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_action;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_action CHECK (
  action IN (
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
    'claim.create','claim.update','claim.lifecycle.transition',
    'variation.create','variation.update','variation.lifecycle.transition','variation.link','variation.unlink',
    'rfi.create','rfi.update','rfi.lifecycle.transition',
    'submittal.create','submittal.update','submittal.lifecycle.transition','submittal.link',
    'redaction.apply','redaction.reverse',
    'risk.create','risk.update','risk.delete',
    'interpretation.create','interpretation.update','interpretation.delete',
    'payment_application.create','payment_application.update','payment_application.transition',
    'policy.create','policy.update','policy.delete',
    'diary.create','diary.update','diary.conflict.record','diary.conflict.reconcile',
    'record_flag.create','record_flag.update','record_flag.delete','record_flag.hold_point.release',
    'correspondence_template.create','correspondence_template.update',
    'outbound_correspondence.draft','outbound_correspondence.send',
    'outbound_correspondence.send_failed','outbound_correspondence.recall',
    'closeout_template.create','closeout.checklist.create',
    'closeout.item.sign','closeout.item.waive','closeout.certificate.generate',
    'digest_preference.update','digest.send',
    'audit.export.request','audit.export.complete'
  )
);
