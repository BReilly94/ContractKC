-- Migration: 0010_lifecycle_registers
-- Scope: Slice Q — Phase 2 lifecycle state machines (§3.34, §6.22).
--
-- Establishes the skeleton tables + transition tables for Claim, Variation,
-- RFI, and Submittal. CRUD surfaces, link tables, and domain-specific columns
-- (amounts, narratives, discipline, etc.) are added in Slices S and T.
--
-- The shape mirrors deadline_lifecycle_transition (Migration 0005): a CHECK
-- constraint on lifecycle_state plus a seeded transition table the service
-- layer joins against for defense in depth.
--
-- Target: SQL Server 2022.

------------------------------------------------------------------------
-- claim
-- SOW §6.22: Draft → Internal Review → Submitted → Client Response Received
--            → Under Negotiation → Resolved (Won / Settled / Lost / Withdrawn)
-- Terminal states are split per resolution (matches deadline Complete/Missed
-- precedent) so the FSM itself records the outcome.
------------------------------------------------------------------------
CREATE TABLE claim (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  claim_number            INT             NULL,
  title                   NVARCHAR(512)   NOT NULL,
  lifecycle_state         VARCHAR(32)     NOT NULL DEFAULT 'Draft',
  submitted_at            DATETIMEOFFSET  NULL,
  resolved_at             DATETIMEOFFSET  NULL,
  resolution_note         NVARCHAR(1024)  NULL,
  created_by_user_id      CHAR(26)        NOT NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_claim_contract   FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_claim_creator    FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_claim_contract_number UNIQUE (contract_id, claim_number),
  CONSTRAINT ck_claim_lifecycle CHECK (
    lifecycle_state IN (
      'Draft','InternalReview','Submitted','ClientResponseReceived',
      'UnderNegotiation',
      'ResolvedWon','ResolvedSettled','ResolvedLost','ResolvedWithdrawn'
    )
  )
);
CREATE INDEX ix_claim_contract        ON claim(contract_id);
CREATE INDEX ix_claim_lifecycle_state ON claim(lifecycle_state);

CREATE TABLE claim_lifecycle_transition (
  from_state VARCHAR(32) NOT NULL,
  to_state   VARCHAR(32) NOT NULL,
  CONSTRAINT pk_claim_lifecycle_transition PRIMARY KEY (from_state, to_state)
);

INSERT INTO claim_lifecycle_transition (from_state, to_state) VALUES
  ('Draft',                    'InternalReview'),
  ('Draft',                    'ResolvedWithdrawn'),
  ('InternalReview',           'Draft'),
  ('InternalReview',           'Submitted'),
  ('InternalReview',           'ResolvedWithdrawn'),
  ('Submitted',                'ClientResponseReceived'),
  ('Submitted',                'ResolvedWithdrawn'),
  ('ClientResponseReceived',   'UnderNegotiation'),
  ('ClientResponseReceived',   'ResolvedWon'),
  ('ClientResponseReceived',   'ResolvedSettled'),
  ('ClientResponseReceived',   'ResolvedLost'),
  ('ClientResponseReceived',   'ResolvedWithdrawn'),
  ('UnderNegotiation',         'ResolvedWon'),
  ('UnderNegotiation',         'ResolvedSettled'),
  ('UnderNegotiation',         'ResolvedLost'),
  ('UnderNegotiation',         'ResolvedWithdrawn');

------------------------------------------------------------------------
-- variation
-- SOW §6.22: Proposed → Priced → Submitted → Approved / Rejected / Disputed → Closed
-- Disputed may flow back to Approved or Rejected if the dispute resolves
-- without escalating to a claim. A Disputed variation that escalates to a
-- claim closes via Disputed → Closed; the link to the claim record lives
-- on a separate association table added in Slice S.
------------------------------------------------------------------------
CREATE TABLE variation (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  variation_number        INT             NULL,
  title                   NVARCHAR(512)   NOT NULL,
  lifecycle_state         VARCHAR(32)     NOT NULL DEFAULT 'Proposed',
  submitted_at            DATETIMEOFFSET  NULL,
  closed_at               DATETIMEOFFSET  NULL,
  created_by_user_id      CHAR(26)        NOT NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_variation_contract   FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_variation_creator    FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_variation_contract_number UNIQUE (contract_id, variation_number),
  CONSTRAINT ck_variation_lifecycle CHECK (
    lifecycle_state IN ('Proposed','Priced','Submitted','Approved','Rejected','Disputed','Closed')
  )
);
CREATE INDEX ix_variation_contract        ON variation(contract_id);
CREATE INDEX ix_variation_lifecycle_state ON variation(lifecycle_state);

CREATE TABLE variation_lifecycle_transition (
  from_state VARCHAR(32) NOT NULL,
  to_state   VARCHAR(32) NOT NULL,
  CONSTRAINT pk_variation_lifecycle_transition PRIMARY KEY (from_state, to_state)
);

INSERT INTO variation_lifecycle_transition (from_state, to_state) VALUES
  ('Proposed',  'Priced'),
  ('Proposed',  'Closed'),
  ('Priced',    'Submitted'),
  ('Priced',    'Closed'),
  ('Submitted', 'Approved'),
  ('Submitted', 'Rejected'),
  ('Submitted', 'Disputed'),
  ('Approved',  'Closed'),
  ('Rejected',  'Closed'),
  ('Disputed',  'Approved'),
  ('Disputed',  'Rejected'),
  ('Disputed',  'Closed');

------------------------------------------------------------------------
-- rfi
-- SOW §6.22: Draft → Issued → Awaiting Response → Response Received → Closed
-- ResponseReceived → AwaitingResponse permitted for follow-up exchanges on
-- the same RFI before it is closed out.
------------------------------------------------------------------------
CREATE TABLE rfi (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  rfi_number              INT             NULL,
  subject                 NVARCHAR(512)   NOT NULL,
  lifecycle_state         VARCHAR(32)     NOT NULL DEFAULT 'Draft',
  issued_at               DATETIMEOFFSET  NULL,
  response_received_at    DATETIMEOFFSET  NULL,
  closed_at               DATETIMEOFFSET  NULL,
  created_by_user_id      CHAR(26)        NOT NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_rfi_contract   FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_rfi_creator    FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_rfi_contract_number UNIQUE (contract_id, rfi_number),
  CONSTRAINT ck_rfi_lifecycle CHECK (
    lifecycle_state IN ('Draft','Issued','AwaitingResponse','ResponseReceived','Closed')
  )
);
CREATE INDEX ix_rfi_contract        ON rfi(contract_id);
CREATE INDEX ix_rfi_lifecycle_state ON rfi(lifecycle_state);

CREATE TABLE rfi_lifecycle_transition (
  from_state VARCHAR(32) NOT NULL,
  to_state   VARCHAR(32) NOT NULL,
  CONSTRAINT pk_rfi_lifecycle_transition PRIMARY KEY (from_state, to_state)
);

INSERT INTO rfi_lifecycle_transition (from_state, to_state) VALUES
  ('Draft',             'Issued'),
  ('Draft',             'Closed'),
  ('Issued',            'AwaitingResponse'),
  ('Issued',            'Closed'),
  ('AwaitingResponse',  'ResponseReceived'),
  ('AwaitingResponse',  'Closed'),
  ('ResponseReceived',  'AwaitingResponse'),
  ('ResponseReceived',  'Closed');

------------------------------------------------------------------------
-- submittal
-- SOW §3.11b + §6.22: Draft → Submitted → Under Review
--   → Approved / Approved as Noted / Revise and Resubmit / Rejected → Closed
-- Resubmissions preserve a chain via previous_submittal_id (self-FK). A
-- ReviseAndResubmit outcome closes the current record; the next revision
-- is a new submittal pointing back to it.
------------------------------------------------------------------------
CREATE TABLE submittal (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  submittal_number        INT             NULL,
  title                   NVARCHAR(512)   NOT NULL,
  previous_submittal_id   CHAR(26)        NULL,
  lifecycle_state         VARCHAR(32)     NOT NULL DEFAULT 'Draft',
  submitted_at            DATETIMEOFFSET  NULL,
  reviewed_at             DATETIMEOFFSET  NULL,
  closed_at               DATETIMEOFFSET  NULL,
  created_by_user_id      CHAR(26)        NOT NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_submittal_contract   FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_submittal_creator    FOREIGN KEY (created_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT fk_submittal_previous   FOREIGN KEY (previous_submittal_id) REFERENCES submittal(id),
  CONSTRAINT uq_submittal_contract_number UNIQUE (contract_id, submittal_number),
  CONSTRAINT ck_submittal_lifecycle CHECK (
    lifecycle_state IN (
      'Draft','Submitted','UnderReview',
      'Approved','ApprovedAsNoted','ReviseAndResubmit','Rejected','Closed'
    )
  ),
  CONSTRAINT ck_submittal_no_self_chain CHECK (previous_submittal_id IS NULL OR previous_submittal_id <> id)
);
CREATE INDEX ix_submittal_contract         ON submittal(contract_id);
CREATE INDEX ix_submittal_lifecycle_state  ON submittal(lifecycle_state);
CREATE INDEX ix_submittal_previous         ON submittal(previous_submittal_id) WHERE previous_submittal_id IS NOT NULL;

CREATE TABLE submittal_lifecycle_transition (
  from_state VARCHAR(32) NOT NULL,
  to_state   VARCHAR(32) NOT NULL,
  CONSTRAINT pk_submittal_lifecycle_transition PRIMARY KEY (from_state, to_state)
);

INSERT INTO submittal_lifecycle_transition (from_state, to_state) VALUES
  ('Draft',              'Submitted'),
  ('Draft',              'Closed'),
  ('Submitted',          'UnderReview'),
  ('Submitted',          'Closed'),
  ('UnderReview',        'Approved'),
  ('UnderReview',        'ApprovedAsNoted'),
  ('UnderReview',        'ReviseAndResubmit'),
  ('UnderReview',        'Rejected'),
  ('Approved',           'Closed'),
  ('ApprovedAsNoted',    'Closed'),
  ('ReviseAndResubmit',  'Closed'),
  ('Rejected',           'Closed');

------------------------------------------------------------------------
-- audit_log expansion for Phase 2 register lifecycle actions
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
    'Claim','Variation','Rfi','Submittal'
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
    'submittal.create','submittal.update','submittal.lifecycle.transition'
  )
);
