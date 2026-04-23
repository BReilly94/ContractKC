-- Migration: 0009_exports
-- Scope: §5.13 data portability export + logging.

CREATE TABLE export_job (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  requested_by_user_id    CHAR(26)        NOT NULL,
  include_redacted        BIT             NOT NULL DEFAULT 0,
  state                   VARCHAR(16)     NOT NULL DEFAULT 'Pending',
  byte_size               BIGINT          NULL,
  file_count              INT             NULL,
  blob_path               VARCHAR(512)    NULL,
  manifest_sha256         CHAR(64)        NULL,
  error_message           NVARCHAR(MAX)   NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  completed_at            DATETIMEOFFSET  NULL,
  CONSTRAINT fk_export_contract FOREIGN KEY (contract_id)           REFERENCES contract(id),
  CONSTRAINT fk_export_user     FOREIGN KEY (requested_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT ck_export_state CHECK (state IN ('Pending','Processing','Succeeded','Failed'))
);

CREATE INDEX ix_export_contract ON export_job(contract_id);

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
    'ExportJob'
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
    'export.request','export.complete','export.fail','export.download'
  )
);
