-- Migration: 0017_erp_snapshot
-- Scope: Slice Z — §6.14 / §7.8 ERP read-only linkage (Phase 2 scope).
--
-- Phase 2 scope: approved contract value + approved variations. ERP is and
-- remains the system-of-record for cost/commercial data. CKB only snapshots
-- the subset needed to drive the Variation register and the quantum
-- component of Claim Readiness Score.
--
-- Manual-entry is the default fallback (SOW §6.14 item 4). The real ERP
-- client (SAP / Dynamics / Viewpoint / etc.) is pluggable behind the
-- `ErpClient` interface in `packages/erp/`; this table stores whichever
-- source wrote the row. Scheduler-written rows set
-- `last_refreshed_by_system` and leave `last_refreshed_by_user_id` NULL.

CREATE TABLE erp_snapshot (
  id                                CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id                       CHAR(26)         NOT NULL,
  taken_at                          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  approved_contract_value_cents     BIGINT           NULL,
  approved_variations               NVARCHAR(MAX)    NOT NULL,  -- JSON array of {reference, title, approvedAmountCents, approvedAt}
  source_system                     VARCHAR(40)      NOT NULL,
  currency                          CHAR(3)          NULL,
  last_refreshed_by_user_id         CHAR(26)         NULL,
  last_refreshed_by_system          VARCHAR(40)      NULL,
  notes                             NVARCHAR(MAX)    NULL,
  created_at                        DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_erp_snap_contract FOREIGN KEY (contract_id)               REFERENCES contract(id),
  CONSTRAINT fk_erp_snap_user     FOREIGN KEY (last_refreshed_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_erp_snap_source CHECK (
    source_system IN ('Manual','SAP','Dynamics','Viewpoint','JDE','Other')
  ),
  CONSTRAINT ck_erp_snap_value_nonneg CHECK (
    approved_contract_value_cents IS NULL OR approved_contract_value_cents >= 0
  ),
  CONSTRAINT ck_erp_snap_principal_xor CHECK (
    -- Exactly one of user / system must be set (manual entry vs. scheduler).
    (last_refreshed_by_user_id IS NOT NULL AND last_refreshed_by_system IS NULL)
    OR (last_refreshed_by_user_id IS NULL AND last_refreshed_by_system IS NOT NULL)
  )
);

CREATE INDEX ix_erp_snap_contract_taken
  ON erp_snapshot(contract_id, taken_at DESC);

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
    'BidHandoff',
    'ErpSnapshot'
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
    'bid_handoff.receive','bid_handoff.replay',
    'erp.refresh','erp.manual_entry'
  )
);
