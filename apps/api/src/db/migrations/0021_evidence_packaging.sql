-- Migration: 0021_evidence_packaging
-- Scope: Slice DD — §3.37 Evidence Packaging with chain-of-custody manifest
--        and redaction log.
--
-- One-click bundling from a claim, variation, dispute, or standalone query.
-- Bundles are versioned and lock on external submission.

CREATE TABLE evidence_bundle (
  id                             CHAR(26)         NOT NULL PRIMARY KEY,
  contract_id                    CHAR(26)         NOT NULL,
  source_type                    VARCHAR(24)      NOT NULL,
  source_id                      CHAR(26)         NULL,
  title                          NVARCHAR(512)    NOT NULL,
  version                        INT              NOT NULL DEFAULT 1,
  previous_bundle_id             CHAR(26)         NULL,
  include_redacted               BIT              NOT NULL DEFAULT 0,
  pdf_portfolio_blob_path        VARCHAR(512)     NULL,
  zip_package_blob_path          VARCHAR(512)     NULL,
  manifest_blob_path             VARCHAR(512)     NULL,
  redaction_log_blob_path        VARCHAR(512)     NULL,
  byte_size                      BIGINT           NULL,
  file_count                     INT              NULL,
  manifest_sha256                CHAR(64)         NULL,
  build_state                    VARCHAR(16)      NOT NULL DEFAULT 'Pending',
  built_at                       DATETIMEOFFSET   NULL,
  submitted_externally_at        DATETIMEOFFSET   NULL,
  submitted_externally_by_user_id CHAR(26)        NULL,
  locked_at                      DATETIMEOFFSET   NULL,
  created_by_user_id             CHAR(26)         NOT NULL,
  created_at                     DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                     DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_evb_contract        FOREIGN KEY (contract_id)           REFERENCES contract(id),
  CONSTRAINT fk_evb_creator         FOREIGN KEY (created_by_user_id)    REFERENCES app_user(id),
  CONSTRAINT fk_evb_submitter       FOREIGN KEY (submitted_externally_by_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_evb_previous        FOREIGN KEY (previous_bundle_id)    REFERENCES evidence_bundle(id),
  CONSTRAINT ck_evb_source_type CHECK (
    source_type IN ('Claim','Variation','Dispute','Query','Standalone')
  ),
  CONSTRAINT ck_evb_build_state CHECK (
    build_state IN ('Pending','Building','Built','Submitted','Failed')
  ),
  CONSTRAINT ck_evb_version_pos CHECK (version >= 1)
);

CREATE INDEX ix_evb_contract    ON evidence_bundle(contract_id);
CREATE INDEX ix_evb_source      ON evidence_bundle(source_type, source_id);

------------------------------------------------------------------------
-- Artifacts attached to a bundle. Captured per-artifact at bundle-build
-- time so the chain-of-custody is a point-in-time snapshot of sources,
-- even if the underlying records evolve afterwards.
------------------------------------------------------------------------
CREATE TABLE evidence_bundle_artifact (
  id                        CHAR(26)       NOT NULL PRIMARY KEY,
  bundle_id                 CHAR(26)       NOT NULL,
  artifact_type             VARCHAR(24)    NOT NULL,
  artifact_id               CHAR(26)       NOT NULL,
  original_filename         NVARCHAR(256)  NULL,
  sha256                    CHAR(64)       NULL,
  ingested_at               DATETIMEOFFSET NULL,
  ingested_by_user_id       CHAR(26)       NULL,
  version_chain_json        NVARCHAR(MAX)  NULL,
  include_in_pdf            BIT            NOT NULL DEFAULT 1,
  display_order             INT            NOT NULL DEFAULT 0,
  citation_note             NVARCHAR(512)  NULL,
  redaction_summary_json    NVARCHAR(MAX)  NULL,
  created_at                DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_evba_bundle    FOREIGN KEY (bundle_id)           REFERENCES evidence_bundle(id),
  CONSTRAINT fk_evba_ingester  FOREIGN KEY (ingested_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_evba_artifact_type CHECK (
    artifact_type IN (
      'Document','DocumentVersion','Email','EmailAttachment',
      'Clause','SiteDiaryEntry','RecordFlag','Variation','Claim'
    )
  )
);
CREATE INDEX ix_evba_bundle ON evidence_bundle_artifact(bundle_id);
