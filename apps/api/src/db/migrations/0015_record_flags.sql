-- Migration: 0015_record_flags
-- Scope: Slice V — §3.14b Safety, QA/QC & Inspection flags.
--
-- Not a separate register — structured classifications layered over diary
-- entries, documents, and emails. Flag holders carry contractual reporting
-- timelines that feed the Deadline Tracker via the standard verification gate.

CREATE TABLE record_flag (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  target_type             VARCHAR(24)     NOT NULL,
  target_id               CHAR(26)        NOT NULL,
  flag_type               VARCHAR(32)     NOT NULL,
  severity                VARCHAR(16)     NULL,
  hold_point_name         NVARCHAR(256)   NULL,
  hold_point_released     BIT             NULL,
  notification_due_at     DATETIMEOFFSET  NULL,
  deadline_id             CHAR(26)        NULL,
  note                    NVARCHAR(MAX)   NULL,
  created_by_user_id      CHAR(26)        NOT NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_recflag_contract   FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_recflag_deadline   FOREIGN KEY (deadline_id)        REFERENCES deadline(id),
  CONSTRAINT fk_recflag_creator    FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_recflag_target_type CHECK (
    target_type IN ('SiteDiaryEntry','Document','Email','Clause')
  ),
  CONSTRAINT ck_recflag_flag_type CHECK (
    flag_type IN ('Incident','NCR','InspectionRecord','HoldPointRelease','CorrectiveAction','Observation')
  ),
  CONSTRAINT ck_recflag_severity CHECK (
    severity IS NULL OR severity IN ('Low','Medium','High','Critical')
  )
);

CREATE INDEX ix_recflag_contract        ON record_flag(contract_id);
CREATE INDEX ix_recflag_target          ON record_flag(target_type, target_id);
CREATE INDEX ix_recflag_contract_type   ON record_flag(contract_id, flag_type);
CREATE INDEX ix_recflag_unreleased_hp
  ON record_flag(contract_id, flag_type)
  WHERE flag_type = 'HoldPointRelease' AND hold_point_released = 0;

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
    'RecordFlag'
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
    'record_flag.create','record_flag.update','record_flag.delete',
    'record_flag.hold_point.release'
  )
);
