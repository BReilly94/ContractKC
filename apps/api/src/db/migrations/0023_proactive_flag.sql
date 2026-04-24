-- Migration: 0023_proactive_flag
-- Scope: Slice GG — §6.15 Proactive AI Flagging + §7.10 cost control.
--
-- Two-tier routing: Sonnet first-pass + Opus deep-review.
-- Per-contract daily flag budget — when exceeded the pipeline emits an
-- alert to the KnowledgeCentreAdministrator (NEVER silent throttle).
--
-- Non-Negotiable #1 — every flag carries cited chunks/clauses from the
-- retrieval result set. Post-generation citation verification happens in
-- `packages/ai/src/citations.ts`; flags that fail verification are logged
-- as AI quality incidents and are NOT inserted into this table.

------------------------------------------------------------------------
-- contract.daily_flag_budget — per-contract cap, raisable by admins.
------------------------------------------------------------------------
ALTER TABLE contract
  ADD daily_flag_budget INT NOT NULL CONSTRAINT df_contract_daily_flag_budget DEFAULT 50;
GO

ALTER TABLE contract
  ADD CONSTRAINT ck_contract_daily_flag_budget_nonneg CHECK (daily_flag_budget >= 0);
GO

------------------------------------------------------------------------
-- proactive_flag
------------------------------------------------------------------------
CREATE TABLE proactive_flag (
  id                      CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)         NOT NULL,
  trigger_event_type      VARCHAR(24)      NOT NULL,
  trigger_event_id        CHAR(26)         NOT NULL,
  flag_kind               VARCHAR(32)      NOT NULL,
  reasoning               NVARCHAR(MAX)    NOT NULL,
  cited_clause_ids        NVARCHAR(MAX)    NOT NULL,     -- JSON array of clause IDs
  cited_chunk_ids         NVARCHAR(MAX)    NOT NULL,     -- JSON array of chunk IDs
  recommended_action      NVARCHAR(1024)   NOT NULL,
  status                  VARCHAR(16)      NOT NULL DEFAULT 'New',
  actioned_by_user_id     CHAR(26)         NULL,
  actioned_at             DATETIMEOFFSET   NULL,
  action_note             NVARCHAR(2048)   NULL,
  first_pass_model        VARCHAR(32)      NOT NULL,
  deep_review_model       VARCHAR(32)      NULL,
  sensitivity_profile     VARCHAR(16)      NOT NULL DEFAULT 'Standard',
  created_at              DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_pflag_contract FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_pflag_actor    FOREIGN KEY (actioned_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_pflag_trigger_event_type CHECK (
    trigger_event_type IN ('Email','Document','SiteDiaryEntry','DrawingRevision')
  ),
  CONSTRAINT ck_pflag_flag_kind CHECK (
    flag_kind IN (
      'PossibleNotice','SuspectedScopeChange','DeadlineImminentNoPrep',
      'RevisionScopeImpact','Other'
    )
  ),
  CONSTRAINT ck_pflag_status CHECK (
    status IN ('New','Actioned','Dismissed','Escalated')
  ),
  CONSTRAINT ck_pflag_sensitivity CHECK (
    sensitivity_profile IN ('Conservative','Standard','Aggressive')
  )
);

CREATE INDEX ix_pflag_contract
  ON proactive_flag(contract_id, created_at DESC);
CREATE INDEX ix_pflag_contract_status
  ON proactive_flag(contract_id, status)
  WHERE status IN ('New','Escalated');
CREATE INDEX ix_pflag_trigger_event
  ON proactive_flag(trigger_event_type, trigger_event_id);

------------------------------------------------------------------------
-- flag_budget_alert — one row per (contract, utc_day) the budget was
-- exceeded, plus who was alerted. The table is append-only at the
-- application layer; only the budget owner raises `daily_flag_budget`
-- on the contract row afterwards.
------------------------------------------------------------------------
CREATE TABLE flag_budget_alert (
  id                      CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)         NOT NULL,
  utc_day                 DATE             NOT NULL,
  budget                  INT              NOT NULL,
  observed_count          INT              NOT NULL,
  alerted_user_id         CHAR(26)         NOT NULL,
  created_at              DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_fba_contract FOREIGN KEY (contract_id)     REFERENCES contract(id),
  CONSTRAINT fk_fba_user     FOREIGN KEY (alerted_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_fba_contract_day UNIQUE (contract_id, utc_day)
);

CREATE INDEX ix_fba_contract_day ON flag_budget_alert(contract_id, utc_day DESC);

------------------------------------------------------------------------
-- notification.kind — add proactive-flag + budget-alert kinds.
------------------------------------------------------------------------
ALTER TABLE notification DROP CONSTRAINT ck_notification_kind;
ALTER TABLE notification ADD CONSTRAINT ck_notification_kind CHECK (
  kind IN (
    'review_queue_item',
    'deadline_due_soon',
    'deadline_missed',
    'summary_unverified',
    'document_quarantined',
    'query_blocked',
    'digest_summary',
    'proactive_flag_raised',
    'flag_budget_exceeded'
  )
);

------------------------------------------------------------------------
-- audit_log CHECK — extend entity_type and action for Slice GG.
-- Superset of 0022_drawing_diff_and_meeting_minutes.
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
    'MeetingMinutesExtraction',
    'ProactiveFlag',
    'FlagBudget'
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
    'minutes.extract','minutes.action_item.create',
    'proactive_flag.raise','proactive_flag.action',
    'proactive_flag.dismiss','proactive_flag.escalate',
    'flag_budget.alert'
  )
);
