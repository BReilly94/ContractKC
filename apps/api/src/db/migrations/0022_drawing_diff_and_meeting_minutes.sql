-- Migration: 0022_drawing_diff_and_meeting_minutes
-- Scope:
--   Slice AA (§6.17) — `drawing_diff` table fed by the drawing-diff AI
--                      capability on every new revision of a Drawing-type
--                      document. Flag raised via record_flag (Observation).
--   Slice BB (§6.19) — MeetingMinutes document category + structured
--                      extraction table whose action items feed the
--                      Deadline Tracker (Unverified by default — NN #2).
--
-- Non-Negotiable #2 — action items land as Unverified deadlines; the
-- verification gate is enforced in the deadline layer, not here.
-- Non-Negotiable #6 — every row is contract_id-scoped.

------------------------------------------------------------------------
-- Slice BB — expand document.category CHECK to include MeetingMinutes.
------------------------------------------------------------------------
ALTER TABLE document DROP CONSTRAINT ck_document_category;
ALTER TABLE document ADD CONSTRAINT ck_document_category CHECK (
  category IN (
    'MasterAgreement', 'Schedule', 'Appendix', 'Amendment',
    'Drawing', 'Specification', 'MeetingMinutes',
    'NegotiationRecord', 'Correspondence',
    'Permit', 'Insurance', 'Bond', 'Other'
  )
);

------------------------------------------------------------------------
-- Slice AA — drawing_diff
------------------------------------------------------------------------
CREATE TABLE drawing_diff (
  id                       CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id              CHAR(26)         NOT NULL,
  document_id              CHAR(26)         NOT NULL,
  prior_version_id         CHAR(26)         NOT NULL,
  new_version_id           CHAR(26)         NOT NULL,
  diff_summary             NVARCHAR(MAX)    NOT NULL,
  change_regions           NVARCHAR(MAX)    NOT NULL,                -- JSON array of {description, priorExcerpt, newExcerpt, citation}
  scope_impact             VARCHAR(16)      NOT NULL,
  ai_capability_version    VARCHAR(64)      NOT NULL,
  record_flag_id           CHAR(26)         NULL,
  created_by_user_id       CHAR(26)         NOT NULL,
  created_at               DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_drawdiff_contract    FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_drawdiff_document    FOREIGN KEY (document_id)        REFERENCES document(id),
  CONSTRAINT fk_drawdiff_prior       FOREIGN KEY (prior_version_id)   REFERENCES document_version(id),
  CONSTRAINT fk_drawdiff_new         FOREIGN KEY (new_version_id)     REFERENCES document_version(id),
  CONSTRAINT fk_drawdiff_record_flag FOREIGN KEY (record_flag_id)     REFERENCES record_flag(id),
  CONSTRAINT fk_drawdiff_creator     FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_drawdiff_pair UNIQUE (document_id, prior_version_id, new_version_id),
  CONSTRAINT ck_drawdiff_scope_impact CHECK (
    scope_impact IN ('None','Minor','Major','Suspected')
  )
);

CREATE INDEX ix_drawdiff_contract ON drawing_diff(contract_id, created_at DESC);
CREATE INDEX ix_drawdiff_document ON drawing_diff(document_id, created_at DESC);

------------------------------------------------------------------------
-- Slice BB — meeting_minutes_extraction
-- An extraction is a 1:1 record keyed by (contract_id, document_id).
-- Action items persist as `deadline` rows (source_type='MeetingMinutes',
-- source_id = extraction.id) — no separate action-item table to keep
-- the Deadline Tracker the single source of truth for time-bound work.
------------------------------------------------------------------------
CREATE TABLE meeting_minutes_extraction (
  id                       CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id              CHAR(26)         NOT NULL,
  document_id              CHAR(26)         NOT NULL,
  meeting_date             DATE             NULL,
  action_item_count        INT              NOT NULL DEFAULT 0,
  ai_capability_version    VARCHAR(64)      NOT NULL,
  created_by_user_id       CHAR(26)         NOT NULL,
  created_at               DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_mmx_contract  FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_mmx_document  FOREIGN KEY (document_id)        REFERENCES document(id),
  CONSTRAINT fk_mmx_creator   FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_mmx_document  UNIQUE (document_id),
  CONSTRAINT ck_mmx_action_item_count_nonneg CHECK (action_item_count >= 0)
);

CREATE INDEX ix_mmx_contract ON meeting_minutes_extraction(contract_id, created_at DESC);

------------------------------------------------------------------------
-- audit_log CHECK: extend entity_type and action whitelists.
-- This rolls up the 0018_audit_export superset (last consolidated
-- baseline) + Slice AA/BB additions. A later migration reconciles
-- the 0016_bid_handoff / 0017_erp_snapshot parallel branch.
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
    'CorrespondenceTemplate','OutboundCorrespondence',
    'CloseoutTemplate','CloseoutChecklist','CloseoutChecklistItem',
    'DigestPreference',
    'AuditExport',
    'DrawingDiff',
    'MeetingMinutesExtraction'
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
    'audit.export.request','audit.export.complete',
    'drawing_diff.compute','drawing_diff.flag_raised',
    'minutes.extract','minutes.action_item.create'
  )
);
