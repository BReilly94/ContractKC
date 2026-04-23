-- Migration: 0003_documents_emails
-- Scope:
--   §5.1 (documents) — document, document_version, tag, document_tag
--   §5.2 (emails) — email, email_thread, email_alias extensions,
--                   sender_trust_entry, email_review_queue_item,
--                   shared_link_capture, calendar_event, inbound_email_event
--
-- All tables follow data-model.md §1 conventions: ULIDs CHAR(26), SHA-256
-- CHAR(64), money BIGINT cents + CHAR(3), timestamps DATETIMEOFFSET (UTC),
-- enums VARCHAR + CHECK. Originals are immutable at the schema level —
-- blob_path / raw_eml_blob_path are write-once (enforced at app layer;
-- the only mutations allowed on these columns are INSERT).

------------------------------------------------------------------------
-- tag (central taxonomy — §5.1.7)
------------------------------------------------------------------------
CREATE TABLE tag (
  id            CHAR(26)        NOT NULL PRIMARY KEY,
  slug          VARCHAR(64)     NOT NULL,
  label         NVARCHAR(128)   NOT NULL,
  category      VARCHAR(32)     NOT NULL,
  created_at    DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT uq_tag_slug UNIQUE (slug),
  CONSTRAINT ck_tag_category CHECK (
    category IN ('Subject', 'Status', 'Confidentiality', 'Workstream', 'Other')
  )
);

-- Seed the Phase 1 starter taxonomy. Extending via migration; no per-contract free-form.
INSERT INTO tag (id, slug, label, category) VALUES
  ('01HXTAGMASTERAGREEMENT0000', 'master-agreement',    'Master Agreement',      'Subject'),
  ('01HXTAGSCHEDULE00000000000', 'schedule',            'Schedule',              'Subject'),
  ('01HXTAGAMENDMENT0000000000', 'amendment',           'Amendment',             'Subject'),
  ('01HXTAGDRAWING00000000000A', 'drawing',             'Drawing',               'Subject'),
  ('01HXTAGSPEC0000000000000AB', 'specification',       'Specification',         'Subject'),
  ('01HXTAGPERMIT00000000000AC', 'permit',              'Permit',                'Subject'),
  ('01HXTAGINSURANCE000000000A', 'insurance',           'Insurance',             'Subject'),
  ('01HXTAGBOND000000000000000', 'bond',                'Bond',                  'Subject'),
  ('01HXTAGPRIVILEGED00000000A', 'privileged',          'Privileged',            'Confidentiality'),
  ('01HXTAGSENSITIVE0000000000', 'commercially-sensitive','Commercially Sensitive','Confidentiality'),
  ('01HXTAGSUPERSEDED000000000', 'superseded',          'Superseded',            'Status'),
  ('01HXTAGUNVERIFIED000000000', 'unverified',          'Unverified',            'Status');

------------------------------------------------------------------------
-- email_thread
------------------------------------------------------------------------
CREATE TABLE email_thread (
  id                  CHAR(26)       NOT NULL PRIMARY KEY,
  contract_id         CHAR(26)       NOT NULL,
  root_email_id       CHAR(26)       NULL,                  -- set after first email inserts
  subject_normalized  NVARCHAR(512)  NULL,
  last_activity_at    DATETIMEOFFSET NULL,
  created_at          DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_email_thread_contract FOREIGN KEY (contract_id) REFERENCES contract(id)
);

CREATE INDEX ix_email_thread_contract ON email_thread(contract_id);

------------------------------------------------------------------------
-- email
------------------------------------------------------------------------
CREATE TABLE email (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  rfc_message_id          VARCHAR(512)    NOT NULL,
  in_reply_to             VARCHAR(512)    NULL,
  references_raw          NVARCHAR(MAX)   NULL,             -- space-joined list
  thread_id               CHAR(26)        NULL,
  direction               VARCHAR(16)     NOT NULL DEFAULT 'Inbound',
  from_address            VARCHAR(320)    NOT NULL,
  from_name               NVARCHAR(256)   NULL,
  to_addresses            NVARCHAR(MAX)   NOT NULL,         -- JSON array
  cc_addresses            NVARCHAR(MAX)   NULL,             -- JSON array
  bcc_addresses           NVARCHAR(MAX)   NULL,             -- JSON array
  subject                 NVARCHAR(1024)  NOT NULL,
  sent_at                 DATETIMEOFFSET  NULL,
  received_at             DATETIMEOFFSET  NOT NULL,
  body_text               NVARCHAR(MAX)   NULL,
  body_html_blob_path     VARCHAR(512)    NULL,
  raw_eml_sha256          CHAR(64)        NOT NULL,
  raw_eml_blob_path       VARCHAR(512)    NOT NULL,
  sender_trust_state      VARCHAR(16)     NOT NULL DEFAULT 'ReviewQueue',
  duplicate_of_email_id   CHAR(26)        NULL,
  privileged_flag         BIT             NOT NULL DEFAULT 0,
  contains_shared_link    BIT             NOT NULL DEFAULT 0,
  shared_link_status      VARCHAR(32)     NOT NULL DEFAULT 'NotApplicable',
  ics_event_id            CHAR(26)        NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_email_contract    FOREIGN KEY (contract_id)             REFERENCES contract(id),
  CONSTRAINT fk_email_thread      FOREIGN KEY (thread_id)               REFERENCES email_thread(id),
  CONSTRAINT fk_email_duplicate   FOREIGN KEY (duplicate_of_email_id)   REFERENCES email(id),
  CONSTRAINT uq_email_contract_messageid UNIQUE (contract_id, rfc_message_id),
  CONSTRAINT ck_email_direction CHECK (direction IN ('Inbound', 'Outbound')),
  CONSTRAINT ck_email_sender_trust CHECK (
    sender_trust_state IN ('Approved', 'ReviewQueue', 'Unapproved')
  ),
  CONSTRAINT ck_email_shared_link CHECK (
    shared_link_status IN (
      'NotApplicable', 'AutoPullPending', 'AutoPullComplete',
      'AutoPullFailed', 'ManualCapturePending', 'ManualCaptureComplete'
    )
  ),
  CONSTRAINT ck_email_raw_eml_path CHECK (raw_eml_blob_path LIKE 'sha256/%'),
  CONSTRAINT ck_email_raw_sha256_len CHECK (LEN(raw_eml_sha256) = 64)
);

CREATE INDEX ix_email_contract              ON email(contract_id);
CREATE INDEX ix_email_contract_received_at  ON email(contract_id, received_at DESC);
CREATE INDEX ix_email_thread                ON email(thread_id);
CREATE INDEX ix_email_raw_eml_sha256        ON email(raw_eml_sha256);
CREATE INDEX ix_email_sender_trust          ON email(sender_trust_state);

ALTER TABLE email_thread
  ADD CONSTRAINT fk_email_thread_root FOREIGN KEY (root_email_id) REFERENCES email(id);

------------------------------------------------------------------------
-- document + document_version
------------------------------------------------------------------------
CREATE TABLE document (
  id                        CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id               CHAR(26)        NOT NULL,
  category                  VARCHAR(40)     NOT NULL,
  mime_type                 VARCHAR(128)    NOT NULL,
  original_filename         NVARCHAR(512)   NOT NULL,
  size_bytes                BIGINT          NOT NULL,
  sha256                    CHAR(64)        NOT NULL,
  blob_path                 VARCHAR(512)    NOT NULL,
  source                    VARCHAR(24)     NOT NULL,
  source_email_id           CHAR(26)        NULL,
  uploaded_by_user_id       CHAR(26)        NULL,
  uploaded_at               DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  language                  VARCHAR(10)     NOT NULL DEFAULT 'en',
  malware_scan_status       VARCHAR(16)     NOT NULL DEFAULT 'Pending',
  malware_scan_signatures   NVARCHAR(MAX)   NULL,
  ocr_status                VARCHAR(16)     NOT NULL DEFAULT 'NotRequired',
  ocr_text_blob_path        VARCHAR(512)    NULL,
  encryption_state          VARCHAR(24)     NOT NULL DEFAULT 'None',
  redaction_state           VARCHAR(16)     NOT NULL DEFAULT 'None',
  current_version_id        CHAR(26)        NULL,
  is_superseded             BIT             NOT NULL DEFAULT 0,
  created_at                DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_document_contract     FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_document_source_email FOREIGN KEY (source_email_id)     REFERENCES email(id),
  CONSTRAINT fk_document_uploaded_by  FOREIGN KEY (uploaded_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_document_category CHECK (
    category IN (
      'MasterAgreement', 'Schedule', 'Appendix', 'Amendment',
      'Drawing', 'Specification', 'NegotiationRecord',
      'Correspondence', 'Permit', 'Insurance', 'Bond', 'Other'
    )
  ),
  CONSTRAINT ck_document_source CHECK (
    source IN ('ManualUpload', 'EmailIngestion', 'BidHandoff')
  ),
  CONSTRAINT ck_document_malware_scan CHECK (
    malware_scan_status IN ('Pending', 'Clean', 'Quarantined')
  ),
  CONSTRAINT ck_document_ocr CHECK (
    ocr_status IN ('NotRequired', 'Pending', 'Complete', 'Failed')
  ),
  CONSTRAINT ck_document_encryption CHECK (
    encryption_state IN ('None', 'EncryptedPending', 'Decrypted')
  ),
  CONSTRAINT ck_document_redaction CHECK (
    redaction_state IN ('None', 'Redacted')
  ),
  CONSTRAINT ck_document_blob_path CHECK (blob_path LIKE 'sha256/%'),
  CONSTRAINT ck_document_sha256_len CHECK (LEN(sha256) = 64),
  CONSTRAINT ck_document_size_nonneg CHECK (size_bytes >= 0)
);

CREATE INDEX ix_document_contract         ON document(contract_id);
CREATE INDEX ix_document_contract_category ON document(contract_id, category);
CREATE INDEX ix_document_source_email     ON document(source_email_id);
CREATE INDEX ix_document_sha256           ON document(sha256);
CREATE INDEX ix_document_malware_scan     ON document(malware_scan_status);
CREATE INDEX ix_document_ocr_status       ON document(ocr_status);

CREATE TABLE document_version (
  id                          CHAR(26)        NOT NULL PRIMARY KEY,
  document_id                 CHAR(26)        NOT NULL,
  version_label               NVARCHAR(64)    NOT NULL,
  sha256                      CHAR(64)        NOT NULL,
  blob_path                   VARCHAR(512)    NOT NULL,
  size_bytes                  BIGINT          NOT NULL,
  uploaded_by_user_id         CHAR(26)        NULL,
  uploaded_at                 DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  superseded_at               DATETIMEOFFSET  NULL,
  superseded_by_version_id    CHAR(26)        NULL,
  CONSTRAINT fk_document_version_document FOREIGN KEY (document_id)             REFERENCES document(id),
  CONSTRAINT fk_document_version_uploaded_by FOREIGN KEY (uploaded_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT ck_document_version_sha256 CHECK (LEN(sha256) = 64),
  CONSTRAINT ck_document_version_blob CHECK (blob_path LIKE 'sha256/%')
);

CREATE INDEX ix_document_version_document ON document_version(document_id);

ALTER TABLE document
  ADD CONSTRAINT fk_document_current_version
      FOREIGN KEY (current_version_id) REFERENCES document_version(id);

------------------------------------------------------------------------
-- document_tag (N:N)
------------------------------------------------------------------------
CREATE TABLE document_tag (
  document_id         CHAR(26)        NOT NULL,
  tag_id              CHAR(26)        NOT NULL,
  tagged_by_user_id   CHAR(26)        NULL,
  tagged_at           DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  tagged_by_source    VARCHAR(16)     NOT NULL DEFAULT 'Manual',
  CONSTRAINT pk_document_tag PRIMARY KEY (document_id, tag_id),
  CONSTRAINT fk_document_tag_document FOREIGN KEY (document_id)     REFERENCES document(id),
  CONSTRAINT fk_document_tag_tag      FOREIGN KEY (tag_id)          REFERENCES tag(id),
  CONSTRAINT fk_document_tag_user     FOREIGN KEY (tagged_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_document_tag_source CHECK (tagged_by_source IN ('Manual', 'AI'))
);

CREATE INDEX ix_document_tag_tag ON document_tag(tag_id);

------------------------------------------------------------------------
-- sender_trust_entry — per-contract (contract_id NOT NULL) + global (NULL)
------------------------------------------------------------------------
CREATE TABLE sender_trust_entry (
  id                CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id       CHAR(26)        NULL,                 -- NULL = global
  match_type        VARCHAR(16)     NOT NULL,
  match_value       NVARCHAR(320)   NOT NULL,
  trust_state       VARCHAR(16)     NOT NULL,
  added_by_user_id  CHAR(26)        NOT NULL,
  added_at          DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  reason            NVARCHAR(1024)  NULL,
  CONSTRAINT fk_sender_trust_contract FOREIGN KEY (contract_id)      REFERENCES contract(id),
  CONSTRAINT fk_sender_trust_user     FOREIGN KEY (added_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_sender_trust_match CHECK (match_type IN ('ExactAddress', 'Domain')),
  CONSTRAINT ck_sender_trust_state CHECK (trust_state IN ('Approved', 'Denied'))
);

CREATE INDEX ix_sender_trust_contract ON sender_trust_entry(contract_id, match_type, match_value);
CREATE INDEX ix_sender_trust_global   ON sender_trust_entry(match_type, match_value) WHERE contract_id IS NULL;

------------------------------------------------------------------------
-- email_review_queue_item (§5.2.7 / §8.12)
------------------------------------------------------------------------
CREATE TABLE email_review_queue_item (
  id                    CHAR(26)        NOT NULL PRIMARY KEY,
  email_id              CHAR(26)        NOT NULL,
  contract_id           CHAR(26)        NOT NULL,          -- denormalized for query speed + default-deny join
  reason                VARCHAR(40)     NOT NULL,
  reason_detail         NVARCHAR(2000)  NULL,
  state                 VARCHAR(16)     NOT NULL DEFAULT 'Pending',
  assigned_to_user_id   CHAR(26)        NULL,
  resolved_at           DATETIMEOFFSET  NULL,
  resolved_by_user_id   CHAR(26)        NULL,
  resolution_notes      NVARCHAR(2000)  NULL,
  created_at            DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_erq_email    FOREIGN KEY (email_id)              REFERENCES email(id),
  CONSTRAINT fk_erq_contract FOREIGN KEY (contract_id)           REFERENCES contract(id),
  CONSTRAINT fk_erq_assigned FOREIGN KEY (assigned_to_user_id)   REFERENCES app_user(id),
  CONSTRAINT fk_erq_resolved FOREIGN KEY (resolved_by_user_id)   REFERENCES app_user(id),
  CONSTRAINT ck_erq_reason CHECK (
    reason IN (
      'UnapprovedSender', 'PasswordProtectedAttachment',
      'SharedLinkPending', 'PrivilegedContent',
      'MalwareSuspect', 'ManualReview'
    )
  ),
  CONSTRAINT ck_erq_state CHECK (
    state IN ('Pending', 'Approved', 'Rejected', 'Actioned')
  )
);

CREATE INDEX ix_erq_contract_state ON email_review_queue_item(contract_id, state);
CREATE INDEX ix_erq_email ON email_review_queue_item(email_id);

------------------------------------------------------------------------
-- shared_link_capture
------------------------------------------------------------------------
CREATE TABLE shared_link_capture (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  email_id                CHAR(26)        NOT NULL,
  provider                VARCHAR(24)     NOT NULL,
  url                     NVARCHAR(2000)  NOT NULL,
  capture_state           VARCHAR(32)     NOT NULL,
  resulting_document_id   CHAR(26)        NULL,
  failure_reason          NVARCHAR(1024)  NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  captured_at             DATETIMEOFFSET  NULL,
  CONSTRAINT fk_slc_email FOREIGN KEY (email_id) REFERENCES email(id),
  CONSTRAINT fk_slc_document FOREIGN KEY (resulting_document_id) REFERENCES document(id),
  CONSTRAINT ck_slc_provider CHECK (
    provider IN ('OneDrive', 'SharePoint', 'WeTransfer', 'Dropbox', 'GoogleDrive', 'Other')
  ),
  CONSTRAINT ck_slc_capture_state CHECK (
    capture_state IN (
      'NotApplicable', 'AutoPullPending', 'AutoPullComplete',
      'AutoPullFailed', 'ManualCapturePending', 'ManualCaptureComplete'
    )
  )
);

CREATE INDEX ix_slc_email ON shared_link_capture(email_id);

------------------------------------------------------------------------
-- calendar_event — parsed from .ics
------------------------------------------------------------------------
CREATE TABLE calendar_event (
  id                        CHAR(26)        NOT NULL PRIMARY KEY,
  email_id                  CHAR(26)        NOT NULL,
  contract_id               CHAR(26)        NOT NULL,
  ics_uid                   VARCHAR(512)    NOT NULL,
  summary                   NVARCHAR(512)   NULL,
  description               NVARCHAR(MAX)   NULL,
  starts_at                 DATETIMEOFFSET  NOT NULL,
  ends_at                   DATETIMEOFFSET  NULL,
  organizer_email           VARCHAR(320)    NULL,
  location                  NVARCHAR(512)   NULL,
  sequence_number           INT             NOT NULL DEFAULT 0,
  rrule_raw                 NVARCHAR(1024)  NULL,
  promoted_to_deadline_id   CHAR(26)        NULL,
  created_at                DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_cev_email    FOREIGN KEY (email_id)    REFERENCES email(id),
  CONSTRAINT fk_cev_contract FOREIGN KEY (contract_id) REFERENCES contract(id),
  CONSTRAINT uq_cev_contract_uid UNIQUE (contract_id, ics_uid, sequence_number)
);

CREATE INDEX ix_cev_contract ON calendar_event(contract_id, starts_at);

ALTER TABLE email
  ADD CONSTRAINT fk_email_ics_event FOREIGN KEY (ics_event_id) REFERENCES calendar_event(id);

------------------------------------------------------------------------
-- inbound_email_event — raw webhook log, 90-day retention
------------------------------------------------------------------------
CREATE TABLE inbound_email_event (
  id                    CHAR(26)        NOT NULL PRIMARY KEY,
  received_at           DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  provider              VARCHAR(32)     NOT NULL,
  raw_payload_blob_path VARCHAR(512)    NULL,
  signature_valid       BIT             NULL,
  resulting_email_id    CHAR(26)        NULL,
  worker_status         VARCHAR(24)     NOT NULL DEFAULT 'Queued',
  last_error            NVARCHAR(MAX)   NULL,
  attempt_count         INT             NOT NULL DEFAULT 0,
  correlation_id        CHAR(26)        NOT NULL,
  CONSTRAINT fk_iee_email FOREIGN KEY (resulting_email_id) REFERENCES email(id),
  CONSTRAINT ck_iee_provider CHECK (provider IN ('SendGrid', 'AzureNative', 'LocalFolderWatcher')),
  CONSTRAINT ck_iee_worker_status CHECK (
    worker_status IN ('Queued', 'Processing', 'Succeeded', 'Failed', 'DeadLettered')
  )
);

CREATE INDEX ix_iee_received_at   ON inbound_email_event(received_at);
CREATE INDEX ix_iee_correlation   ON inbound_email_event(correlation_id);
CREATE INDEX ix_iee_worker_status ON inbound_email_event(worker_status);

------------------------------------------------------------------------
-- email_alias extensions (§5.2 deactivation reason)
------------------------------------------------------------------------
ALTER TABLE email_alias
  ADD deactivation_reason VARCHAR(32) NULL,
      CONSTRAINT ck_email_alias_deactivation_reason CHECK (
        deactivation_reason IS NULL OR deactivation_reason IN (
          'ContractArchived', 'AliasRenamed', 'ManualDisable'
        )
      );

------------------------------------------------------------------------
-- audit_log expansion for Phase 1 surface area
------------------------------------------------------------------------
-- SQL Server requires dropping and recreating the CHECK constraint.
ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_entity_type;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_entity_type CHECK (
  entity_type IN (
    'Contract', 'ContractSummary', 'ContractAccess', 'ContractAccessRevocation',
    'EmailAlias', 'Party', 'User',
    'Document', 'DocumentVersion', 'DocumentTag', 'Tag',
    'Email', 'EmailThread', 'SenderTrustEntry',
    'EmailReviewQueueItem', 'SharedLinkCapture', 'CalendarEvent',
    'InboundEmailEvent'
  )
);

ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_action;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_action CHECK (
  action IN (
    -- Contract + summary + access
    'contract.create', 'contract.update', 'contract.lifecycle.transition',
    'contract_summary.create', 'contract_summary.verify',
    'contract_access.grant', 'contract_access.revoke',
    'contract_access.revocation.reverse',
    -- Aliases + parties + users
    'email_alias.create', 'email_alias.deactivate', 'email_alias.rename',
    'party.create', 'user.create',
    -- Document pipeline
    'document.upload', 'document.version.create',
    'document.tag.add', 'document.tag.remove',
    'document.malware_scan.clean', 'document.malware_scan.quarantine',
    'document.ocr.complete', 'document.ocr.failed',
    'document.decrypt',
    -- Email pipeline
    'email.ingest.accept', 'email.ingest.duplicate',
    'email.sender_trust.change',
    'email_review_queue.create', 'email_review_queue.approve',
    'email_review_queue.reject', 'email_review_queue.action',
    'shared_link_capture.create', 'shared_link_capture.complete',
    'calendar_event.create', 'calendar_event.promote',
    'inbound_email_event.receive', 'inbound_email_event.fail'
  )
);
