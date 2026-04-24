-- Migration: 0017_digest_preferences
-- Scope: Slice II — §3.9 (Phase 2), §6.23 Configurable Notification Digest.
--
-- Per-event notifications continue to live in `notification` (0008). The
-- digest layer aggregates across categories on schedule for each user, as
-- controlled by rows in `digest_preference`.
--
-- A row with contract_id = NULL is a user-wide default. A row with a
-- specific contract_id overrides the wide default for that contract.
-- See resolveEffectivePreference() in packages/domain/src/digest-preference.ts.

CREATE TABLE digest_preference (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  user_id                 CHAR(26)        NOT NULL,
  contract_id             CHAR(26)        NULL,
  frequency               VARCHAR(16)     NOT NULL,
  channels                NVARCHAR(256)   NOT NULL,     -- JSON array: ["InApp"] | ["InApp","Email"]
  categories              NVARCHAR(1024)  NOT NULL,     -- JSON array of DigestCategory
  last_dispatched_at      DATETIMEOFFSET  NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_digest_pref_user     FOREIGN KEY (user_id)     REFERENCES app_user(id),
  CONSTRAINT fk_digest_pref_contract FOREIGN KEY (contract_id) REFERENCES contract(id),
  CONSTRAINT ck_digest_pref_frequency CHECK (frequency IN ('Daily','Weekly','Off'))
);

-- One wide row per user.
CREATE UNIQUE INDEX uq_digest_pref_user_wide
  ON digest_preference(user_id)
  WHERE contract_id IS NULL;

-- One specific row per (user, contract).
CREATE UNIQUE INDEX uq_digest_pref_user_contract
  ON digest_preference(user_id, contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX ix_digest_pref_frequency ON digest_preference(frequency) WHERE frequency <> 'Off';

-- Extend audit log whitelists with digest actions.
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
    'DigestPreference'
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
    'digest_preference.update','digest.send'
  )
);

-- Extend notification.kind whitelist with the aggregate digest kind.
ALTER TABLE notification DROP CONSTRAINT ck_notification_kind;
ALTER TABLE notification ADD CONSTRAINT ck_notification_kind CHECK (
  kind IN (
    'review_queue_item',
    'deadline_due_soon',
    'deadline_missed',
    'summary_unverified',
    'document_quarantined',
    'query_blocked',
    'digest_summary'
  )
);
