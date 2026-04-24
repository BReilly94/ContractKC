-- Migration: 0016_bid_handoff
-- Scope: Slice Y — §3.1 item 2 / §6.1 / §7.7 Bid-to-Contract Handoff.
--
-- Receiving endpoint for the Bid Intake & Generation application. Idempotent
-- on (bid_id, contract_id) — replaying the same handoff must not double-
-- create risks, contacts, or documents. The raw payload is persisted as JSON
-- for replay + audit, and hashed (SHA-256) so tampering is detectable.
--
-- Downstream entities that feed alerts (risks) land as Unverified and
-- require human verification per Non-Negotiable #2. Contacts are created
-- verbatim. Correspondence items are ingested through `document` so the
-- ingestion audit trail stays single-sourced.

CREATE TABLE bid_handoff (
  id                        CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id               CHAR(26)         NOT NULL,
  bid_id                    NVARCHAR(128)    NOT NULL,
  source_system             VARCHAR(40)      NOT NULL,
  received_at               DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  received_by_user_id       CHAR(26)         NULL,  -- NULL when API-key authenticated
  received_via              VARCHAR(16)      NOT NULL,
  raw_payload               NVARCHAR(MAX)    NOT NULL,
  raw_payload_sha256        CHAR(64)         NOT NULL,
  status                    VARCHAR(16)      NOT NULL DEFAULT 'Received',
  risks_created             INT              NOT NULL DEFAULT 0,
  contacts_created          INT              NOT NULL DEFAULT 0,
  documents_created         INT              NOT NULL DEFAULT 0,
  error_message             NVARCHAR(2000)   NULL,
  created_at                DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_bidhandoff_contract FOREIGN KEY (contract_id)          REFERENCES contract(id),
  CONSTRAINT fk_bidhandoff_receiver FOREIGN KEY (received_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT uq_bidhandoff_bid_contract UNIQUE (bid_id, contract_id),
  CONSTRAINT ck_bidhandoff_status CHECK (
    status IN ('Received','Processed','Failed')
  ),
  CONSTRAINT ck_bidhandoff_via CHECK (
    received_via IN ('UserSession','ApiKey')
  )
);

CREATE INDEX ix_bidhandoff_contract   ON bid_handoff(contract_id);
CREATE INDEX ix_bidhandoff_bid_id     ON bid_handoff(bid_id);
CREATE INDEX ix_bidhandoff_status     ON bid_handoff(status);

------------------------------------------------------------------------
-- audit_log expansion
------------------------------------------------------------------------
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
    'BidHandoff'
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
    'record_flag.hold_point.release',
    'bid_handoff.receive','bid_handoff.replay'
  )
);
