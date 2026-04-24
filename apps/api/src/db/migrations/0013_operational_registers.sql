-- Migration: 0013_operational_registers
-- Scope: Slice T — Operational registers:
--   §3.11b Submittals & Transmittal register (extends Slice Q skeleton)
--   §3.15  Payment Application tracking
--   §3.16  Insurance, Bonds & Permit tracking (unified `policy` table)

------------------------------------------------------------------------
-- submittal — extend with operational fields
------------------------------------------------------------------------
ALTER TABLE submittal ADD
  discipline      VARCHAR(40)   NULL,
  work_package    VARCHAR(80)   NULL,
  description     NVARCHAR(MAX) NULL,
  review_clock_start DATETIMEOFFSET NULL,
  review_clock_days  INT NULL,
  review_outcome  VARCHAR(24)   NULL;
-- review_outcome mirrors the terminal lifecycle_state (Approved/ApprovedAsNoted/
-- ReviseAndResubmit/Rejected) for reporting without walking history.

CREATE TABLE submittal_clause_link (
  submittal_id CHAR(26) NOT NULL,
  clause_id    CHAR(26) NOT NULL,
  CONSTRAINT pk_submittal_clause_link PRIMARY KEY (submittal_id, clause_id),
  CONSTRAINT fk_subcl_sub    FOREIGN KEY (submittal_id) REFERENCES submittal(id),
  CONSTRAINT fk_subcl_clause FOREIGN KEY (clause_id)    REFERENCES clause(id)
);

CREATE TABLE submittal_document_link (
  submittal_id CHAR(26) NOT NULL,
  document_id  CHAR(26) NOT NULL,
  CONSTRAINT pk_submittal_document_link PRIMARY KEY (submittal_id, document_id),
  CONSTRAINT fk_subdl_sub FOREIGN KEY (submittal_id) REFERENCES submittal(id),
  CONSTRAINT fk_subdl_doc FOREIGN KEY (document_id)  REFERENCES document(id)
);

------------------------------------------------------------------------
-- payment_application — §3.15
------------------------------------------------------------------------
CREATE TABLE payment_application (
  id                       CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id              CHAR(26)        NOT NULL,
  application_number       INT             NULL,
  period_start             DATE            NULL,
  period_end               DATE            NULL,
  claimed_amount_cents     BIGINT          NULL,
  certified_amount_cents   BIGINT          NULL,
  paid_amount_cents        BIGINT          NULL,
  disputed_amount_cents    BIGINT          NULL,
  status                   VARCHAR(24)     NOT NULL DEFAULT 'Draft',
  submitted_at             DATETIMEOFFSET  NULL,
  certification_due_at     DATETIMEOFFSET  NULL,
  certified_at             DATETIMEOFFSET  NULL,
  payment_due_at           DATETIMEOFFSET  NULL,
  paid_at                  DATETIMEOFFSET  NULL,
  notes                    NVARCHAR(MAX)   NULL,
  created_by_user_id       CHAR(26)        NOT NULL,
  created_at               DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at               DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_payapp_contract FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_payapp_creator  FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_payapp_contract_number UNIQUE (contract_id, application_number),
  CONSTRAINT ck_payapp_status CHECK (
    status IN ('Draft','Submitted','Certified','Paid','Disputed','Closed')
  ),
  CONSTRAINT ck_payapp_period CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  )
);
CREATE INDEX ix_payapp_contract ON payment_application(contract_id);
CREATE INDEX ix_payapp_status   ON payment_application(contract_id, status);

------------------------------------------------------------------------
-- policy — §3.16 unified store for insurance, bonds, permits
------------------------------------------------------------------------
CREATE TABLE policy (
  id                        CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id               CHAR(26)        NOT NULL,
  kind                      VARCHAR(16)     NOT NULL,
  type_detail               VARCHAR(80)     NULL,
  policy_number             NVARCHAR(128)   NULL,
  issuer                    NVARCHAR(256)   NULL,
  coverage_amount_cents     BIGINT          NULL,
  named_insureds            NVARCHAR(MAX)   NULL,
  effective_date            DATE            NULL,
  expiry_date               DATE            NULL,
  renewal_responsibility    VARCHAR(24)     NULL,
  pre_expiry_alert_days     INT             NOT NULL DEFAULT 30,
  notes                     NVARCHAR(MAX)   NULL,
  deadline_id               CHAR(26)        NULL,
  created_by_user_id        CHAR(26)        NOT NULL,
  created_at                DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_policy_contract FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_policy_creator  FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_policy_deadline FOREIGN KEY (deadline_id)        REFERENCES deadline(id),
  CONSTRAINT ck_policy_kind CHECK (kind IN ('Insurance','Bond','Permit')),
  CONSTRAINT ck_policy_renewal CHECK (
    renewal_responsibility IS NULL
    OR renewal_responsibility IN ('Contractor','Client','Consultant','Subcontractor','Other')
  ),
  CONSTRAINT ck_policy_dates CHECK (
    effective_date IS NULL OR expiry_date IS NULL OR expiry_date >= effective_date
  ),
  CONSTRAINT ck_policy_alert_lead_nonneg CHECK (pre_expiry_alert_days >= 0)
);
CREATE INDEX ix_policy_contract ON policy(contract_id);
CREATE INDEX ix_policy_expiry   ON policy(contract_id, expiry_date) WHERE expiry_date IS NOT NULL;

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
    'PaymentApplication','Policy'
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
    'policy.create','policy.update','policy.delete'
  )
);
