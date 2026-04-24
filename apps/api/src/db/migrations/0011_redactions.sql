-- Migration: 0011_redactions
-- Scope: Slice R — §9.4 Redaction controls + §9.6 individual access revocation
--        service exposure (revocation tables already exist from Migration 0001).
--
-- NN #3: originals are never altered. Redactions are a display-layer overlay
-- that hides content without touching the source. The raw Document, Email,
-- or .eml remains bit-identical under the content-addressed hash.

-- §9.6 addition: per-revocation configurable notification to the affected user.
ALTER TABLE contract_access_revocation
  ADD notify_subject BIT NOT NULL DEFAULT 0,
      reversal_reason NVARCHAR(1024) NULL;

CREATE TABLE redaction (
  id                        CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id               CHAR(26)        NOT NULL,
  target_type               VARCHAR(24)     NOT NULL,
  target_id                 CHAR(26)        NOT NULL,
  target_page               INT             NULL,
  span_start                INT             NULL,
  span_end                  INT             NULL,
  scope                     VARCHAR(16)     NOT NULL,
  reason_category           VARCHAR(40)     NOT NULL,
  reason_note               NVARCHAR(1024)  NULL,
  redacted_by_user_id       CHAR(26)        NOT NULL,
  redacted_at               DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  reversed_at               DATETIMEOFFSET  NULL,
  reversed_by_user_id       CHAR(26)        NULL,
  reversal_reason           NVARCHAR(1024)  NULL,
  CONSTRAINT fk_redaction_contract  FOREIGN KEY (contract_id)            REFERENCES contract(id),
  CONSTRAINT fk_redaction_redactor  FOREIGN KEY (redacted_by_user_id)    REFERENCES app_user(id),
  CONSTRAINT fk_redaction_reverser  FOREIGN KEY (reversed_by_user_id)    REFERENCES app_user(id),
  CONSTRAINT ck_redaction_target_type CHECK (
    target_type IN ('Document','DocumentVersion','Email','EmailAttachment','Clause')
  ),
  CONSTRAINT ck_redaction_scope CHECK (
    scope IN ('Passage','Page','Document')
  ),
  CONSTRAINT ck_redaction_reason CHECK (
    reason_category IN (
      'Privileged','CommerciallySensitive','PersonalInformation',
      'ThirdPartyConfidential','LegalHold','Other'
    )
  ),
  CONSTRAINT ck_redaction_span CHECK (
    (span_start IS NULL AND span_end IS NULL)
    OR (span_start IS NOT NULL AND span_end IS NOT NULL AND span_end > span_start)
  ),
  CONSTRAINT ck_redaction_scope_shape CHECK (
    (scope = 'Passage' AND span_start IS NOT NULL AND span_end IS NOT NULL)
    OR (scope = 'Page' AND target_page IS NOT NULL)
    OR (scope = 'Document' AND span_start IS NULL AND span_end IS NULL AND target_page IS NULL)
  ),
  CONSTRAINT ck_redaction_reversal_shape CHECK (
    (reversed_at IS NULL AND reversed_by_user_id IS NULL)
    OR (reversed_at IS NOT NULL AND reversed_by_user_id IS NOT NULL)
  )
);

CREATE INDEX ix_redaction_contract         ON redaction(contract_id);
CREATE INDEX ix_redaction_target           ON redaction(target_type, target_id);
CREATE INDEX ix_redaction_active_by_target
  ON redaction(target_type, target_id)
  WHERE reversed_at IS NULL;

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
    'Redaction'
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
    'variation.create','variation.update','variation.lifecycle.transition',
    'rfi.create','rfi.update','rfi.lifecycle.transition',
    'submittal.create','submittal.update','submittal.lifecycle.transition',
    'redaction.apply','redaction.reverse'
  )
);
