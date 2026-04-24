-- Migration: 0020_outbound_correspondence
-- Scope: Slice W — §3.19 + §6.16 Outbound correspondence from project address.
--
-- Non-Negotiable #10: every outbound email is BCC'd to the project address
-- automatically. This is a system invariant, not a user setting. Enforced
-- at the service layer AND at the DB level via CHECK constraint that the
-- bcc_addresses list must contain the contract's project_email_address.
--
-- Note: this migration is numbered 0020 deliberately to leave 0016–0019
-- for parallel work on other Phase 2 slices (closeout, digest, bid handoff,
-- ERP). The audit_log CHECK constraint extension will be consolidated into
-- a single migration 0025 after all Phase 2 migrations land.

CREATE TABLE correspondence_template (
  id                      CHAR(26)         NOT NULL PRIMARY KEY,
  name                    NVARCHAR(256)    NOT NULL,
  kind                    VARCHAR(40)      NOT NULL,
  version                 INT              NOT NULL DEFAULT 1,
  subject_pattern         NVARCHAR(512)    NOT NULL,
  body_text               NVARCHAR(MAX)    NOT NULL,
  body_html               NVARCHAR(MAX)    NULL,
  is_active               BIT              NOT NULL DEFAULT 1,
  owner_user_id           CHAR(26)         NOT NULL,
  created_by_user_id      CHAR(26)         NOT NULL,
  created_at              DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_corr_tmpl_owner   FOREIGN KEY (owner_user_id)      REFERENCES app_user(id),
  CONSTRAINT fk_corr_tmpl_creator FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_corr_tmpl_name_ver UNIQUE (name, version),
  CONSTRAINT ck_corr_tmpl_kind CHECK (
    kind IN (
      'RFI','DelayNotice','VariationRequest','ChangeOrderResponse',
      'NoticeOfDefault','CureNotice','GeneralCorrespondence',
      'ClaimSubmission','InsuranceNotice','CloseoutCorrespondence'
    )
  )
);

CREATE INDEX ix_corr_tmpl_kind ON correspondence_template(kind, is_active);

------------------------------------------------------------------------
-- outbound_correspondence
------------------------------------------------------------------------
CREATE TABLE outbound_correspondence (
  id                       CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id              CHAR(26)         NOT NULL,
  correspondence_number    INT              NOT NULL,
  kind                     VARCHAR(40)      NOT NULL,
  revision                 INT              NOT NULL DEFAULT 0,
  template_id              CHAR(26)         NULL,
  template_version         INT              NULL,
  subject                  NVARCHAR(512)    NOT NULL,
  body_text                NVARCHAR(MAX)    NOT NULL,
  body_html                NVARCHAR(MAX)    NULL,
  to_addresses             NVARCHAR(MAX)    NOT NULL,
  cc_addresses             NVARCHAR(MAX)    NULL,
  bcc_addresses            NVARCHAR(MAX)    NOT NULL,
  project_bcc_address      VARCHAR(320)     NOT NULL,
  status                   VARCHAR(16)      NOT NULL DEFAULT 'Draft',
  dkim_message_id          VARCHAR(512)     NULL,
  sent_at                  DATETIMEOFFSET   NULL,
  failed_at                DATETIMEOFFSET   NULL,
  failure_reason           NVARCHAR(1024)   NULL,
  created_by_user_id       CHAR(26)         NOT NULL,
  sent_by_user_id          CHAR(26)         NULL,
  created_at               DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at               DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_outcorr_contract FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_outcorr_template FOREIGN KEY (template_id)        REFERENCES correspondence_template(id),
  CONSTRAINT fk_outcorr_creator  FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_outcorr_sender   FOREIGN KEY (sent_by_user_id)    REFERENCES app_user(id),
  CONSTRAINT uq_outcorr_contract_number_rev UNIQUE (contract_id, correspondence_number, revision),
  CONSTRAINT ck_outcorr_status CHECK (
    status IN ('Draft','Sending','Sent','Failed','Recalled')
  ),
  CONSTRAINT ck_outcorr_kind CHECK (
    kind IN (
      'RFI','DelayNotice','VariationRequest','ChangeOrderResponse',
      'NoticeOfDefault','CureNotice','GeneralCorrespondence',
      'ClaimSubmission','InsuranceNotice','CloseoutCorrespondence'
    )
  ),
  CONSTRAINT ck_outcorr_bcc_contains_project CHECK (
    CHARINDEX(project_bcc_address, bcc_addresses) > 0
  ),
  CONSTRAINT ck_outcorr_revision_nonneg CHECK (revision >= 0)
);

CREATE INDEX ix_outcorr_contract ON outbound_correspondence(contract_id);
CREATE INDEX ix_outcorr_status   ON outbound_correspondence(status);

CREATE TABLE outbound_correspondence_attachment (
  id                   CHAR(26)       NOT NULL PRIMARY KEY,
  outbound_id          CHAR(26)       NOT NULL,
  document_id          CHAR(26)       NULL,
  filename             NVARCHAR(256)  NOT NULL,
  content_type         VARCHAR(128)   NOT NULL,
  byte_size            BIGINT         NOT NULL,
  sha256               CHAR(64)       NOT NULL,
  blob_path            VARCHAR(512)   NOT NULL,
  created_at           DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_outcorr_att_outbound FOREIGN KEY (outbound_id) REFERENCES outbound_correspondence(id),
  CONSTRAINT fk_outcorr_att_document FOREIGN KEY (document_id) REFERENCES document(id)
);
CREATE INDEX ix_outcorr_att_outbound ON outbound_correspondence_attachment(outbound_id);
