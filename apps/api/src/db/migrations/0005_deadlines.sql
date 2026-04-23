-- Migration: 0005_deadlines
-- Scope: §5.5 Notice & Deadline Tracker — obligations, lifecycle, history.
--
-- Non-Negotiable #2 discipline: every obligation enters Unverified. Only
-- Verified obligations feed external-user-facing alerts. Enforced by the
-- API layer + a computed column convention that alerting workers JOIN on
-- verification_state = 'Verified'.

CREATE TABLE deadline (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  label                   NVARCHAR(512)   NOT NULL,
  responsible_party       VARCHAR(24)     NOT NULL,
  trigger_condition       NVARCHAR(1024)  NULL,
  duration_days           INT             NULL,
  absolute_date           DATE            NULL,
  alert_lead_days         INT             NOT NULL DEFAULT 3,
  consequence             NVARCHAR(1024)  NULL,
  verification_state      VARCHAR(16)     NOT NULL DEFAULT 'Unverified',
  lifecycle_state         VARCHAR(24)     NOT NULL DEFAULT 'Extracted',
  source_type             VARCHAR(24)     NOT NULL,
  source_id               CHAR(26)        NULL,
  source_citation         NVARCHAR(256)   NULL,
  extracted_by_capability_version VARCHAR(64) NULL,
  created_by_user_id      CHAR(26)        NOT NULL,
  verified_by_user_id     CHAR(26)        NULL,
  verified_at             DATETIMEOFFSET  NULL,
  completed_at            DATETIMEOFFSET  NULL,
  completed_by_user_id    CHAR(26)        NULL,
  due_at                  DATETIMEOFFSET  NULL,  -- materialised from absolute_date or a trigger-fire event
  triggered_at            DATETIMEOFFSET  NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_deadline_contract    FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_deadline_creator     FOREIGN KEY (created_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT fk_deadline_verifier    FOREIGN KEY (verified_by_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_deadline_completer   FOREIGN KEY (completed_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_deadline_responsible CHECK (
    responsible_party IN ('Contractor', 'Client', 'Consultant', 'Other')
  ),
  CONSTRAINT ck_deadline_verification CHECK (
    verification_state IN ('Unverified', 'Verified')
  ),
  CONSTRAINT ck_deadline_lifecycle CHECK (
    lifecycle_state IN ('Extracted', 'Verified', 'Active', 'Triggered', 'Complete', 'Missed', 'Cancelled')
  ),
  CONSTRAINT ck_deadline_source CHECK (
    source_type IN ('Clause', 'Email', 'Document', 'CalendarEvent', 'Manual', 'MeetingMinutes')
  ),
  CONSTRAINT ck_deadline_duration_nonneg CHECK (duration_days IS NULL OR duration_days >= 0),
  CONSTRAINT ck_deadline_alert_lead_nonneg CHECK (alert_lead_days >= 0)
);

CREATE INDEX ix_deadline_contract           ON deadline(contract_id);
CREATE INDEX ix_deadline_verification_state ON deadline(verification_state);
CREATE INDEX ix_deadline_lifecycle_state    ON deadline(lifecycle_state);
CREATE INDEX ix_deadline_due_at             ON deadline(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX ix_deadline_active_alerts
  ON deadline(contract_id, due_at)
  WHERE verification_state = 'Verified' AND lifecycle_state IN ('Verified','Active');

CREATE TABLE deadline_lifecycle_transition (
  from_state VARCHAR(24) NOT NULL,
  to_state   VARCHAR(24) NOT NULL,
  CONSTRAINT pk_deadline_lifecycle_transition PRIMARY KEY (from_state, to_state),
  CONSTRAINT ck_dlt_from CHECK (
    from_state IN ('Extracted','Verified','Active','Triggered','Complete','Missed','Cancelled')
  ),
  CONSTRAINT ck_dlt_to CHECK (
    to_state IN ('Extracted','Verified','Active','Triggered','Complete','Missed','Cancelled')
  )
);

INSERT INTO deadline_lifecycle_transition (from_state, to_state) VALUES
  ('Extracted', 'Verified'),
  ('Extracted', 'Cancelled'),
  ('Verified',  'Active'),
  ('Verified',  'Cancelled'),
  ('Active',    'Triggered'),
  ('Active',    'Complete'),
  ('Active',    'Missed'),
  ('Active',    'Cancelled'),
  ('Triggered', 'Complete'),
  ('Triggered', 'Missed');

------------------------------------------------------------------------
-- audit_log expansion for deadline actions
------------------------------------------------------------------------
ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_entity_type;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_entity_type CHECK (
  entity_type IN (
    'Contract', 'ContractSummary', 'ContractAccess', 'ContractAccessRevocation',
    'EmailAlias', 'Party', 'User',
    'Document', 'DocumentVersion', 'DocumentTag', 'Tag',
    'Email', 'EmailThread', 'SenderTrustEntry',
    'EmailReviewQueueItem', 'SharedLinkCapture', 'CalendarEvent',
    'InboundEmailEvent',
    'Deadline'
  )
);

ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_action;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_action CHECK (
  action IN (
    'contract.create', 'contract.update', 'contract.lifecycle.transition',
    'contract_summary.create', 'contract_summary.verify',
    'contract_access.grant', 'contract_access.revoke',
    'contract_access.revocation.reverse',
    'email_alias.create', 'email_alias.deactivate', 'email_alias.rename',
    'party.create', 'user.create',
    'document.upload', 'document.version.create',
    'document.tag.add', 'document.tag.remove',
    'document.malware_scan.clean', 'document.malware_scan.quarantine',
    'document.ocr.complete', 'document.ocr.failed', 'document.decrypt',
    'email.ingest.accept', 'email.ingest.duplicate',
    'email.sender_trust.change',
    'email_review_queue.create', 'email_review_queue.approve',
    'email_review_queue.reject', 'email_review_queue.action',
    'shared_link_capture.create', 'shared_link_capture.complete',
    'calendar_event.create', 'calendar_event.promote',
    'inbound_email_event.receive', 'inbound_email_event.fail',
    'deadline.extract', 'deadline.create', 'deadline.verify',
    'deadline.update', 'deadline.transition', 'deadline.complete',
    'deadline.cancel'
  )
);
