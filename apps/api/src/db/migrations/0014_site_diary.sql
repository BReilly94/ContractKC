-- Migration: 0014_site_diary
-- Scope: Slice U — §3.14 Daily Site Diary + §8.10b Offline Diary Behaviour.
--
-- Non-Negotiable #9: contemporaneous lock. Entries are not editable after
-- end-of-next-business-day. Enforced server-side via `locked_at` computed
-- from creation timestamp, checked on every update.
--
-- §8.10b: creation timestamp is set at moment-of-creation on the client
-- (when offline) and preserved as `occurred_at`; server also records
-- `synced_at` and `created_at` for the sync audit trail. The lock is
-- keyed to `occurred_at`, not `synced_at`, so a sync delay does not
-- extend or shorten the evidentiary lock window.

CREATE TABLE site_diary_entry (
  id                        CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id               CHAR(26)         NOT NULL,
  author_user_id            CHAR(26)         NOT NULL,
  occurred_at               DATETIMEOFFSET   NOT NULL,
  synced_at                 DATETIMEOFFSET   NULL,
  client_draft_id           VARCHAR(64)      NULL,
  weather                   NVARCHAR(512)    NULL,
  crew_summary              NVARCHAR(MAX)    NULL,
  equipment_summary         NVARCHAR(MAX)    NULL,
  subcontractor_summary     NVARCHAR(MAX)    NULL,
  visitors                  NVARCHAR(MAX)    NULL,
  incidents_summary         NVARCHAR(MAX)    NULL,
  delays_summary            NVARCHAR(MAX)    NULL,
  verbal_instructions       NVARCHAR(MAX)    NULL,
  free_narrative            NVARCHAR(MAX)    NULL,
  tags                      NVARCHAR(1024)   NULL,
  sync_state                VARCHAR(16)      NOT NULL DEFAULT 'Synced',
  conflict_of_entry_id      CHAR(26)         NULL,
  conflict_reconciled_at    DATETIMEOFFSET   NULL,
  created_at                DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_diary_contract      FOREIGN KEY (contract_id)          REFERENCES contract(id),
  CONSTRAINT fk_diary_author        FOREIGN KEY (author_user_id)       REFERENCES app_user(id),
  CONSTRAINT fk_diary_conflict      FOREIGN KEY (conflict_of_entry_id) REFERENCES site_diary_entry(id),
  CONSTRAINT uq_diary_client_draft  UNIQUE (author_user_id, client_draft_id),
  CONSTRAINT ck_diary_sync_state CHECK (
    sync_state IN ('Synced','ConflictUnresolved','ConflictReconciled')
  )
);

CREATE INDEX ix_diary_contract_occurred ON site_diary_entry(contract_id, occurred_at DESC);
CREATE INDEX ix_diary_author            ON site_diary_entry(author_user_id, occurred_at DESC);

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
    'SiteDiaryEntry'
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
    'diary.create','diary.update','diary.conflict.record','diary.conflict.reconcile'
  )
);
