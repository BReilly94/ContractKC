-- Migration: 0022_claim_workspace
-- Scope: Slice EE — §3.17 Claim Drafting Workspace + §3.18 Claim Register.
-- Claim table skeleton exists from Slice Q; this extends it with the
-- narrative, commercial figures, and per-assertion citation records.

ALTER TABLE claim ADD
  narrative                  NVARCHAR(MAX) NULL,
  amount_claimed_cents       BIGINT        NULL,
  amount_awarded_cents       BIGINT        NULL,
  time_impact_days           INT           NULL,
  trigger_event_summary      NVARCHAR(2000) NULL,
  primary_clause_id          CHAR(26)      NULL,
  CONSTRAINT fk_claim_primary_clause FOREIGN KEY (primary_clause_id) REFERENCES clause(id);

------------------------------------------------------------------------
-- claim_assertion — every factual assertion in a claim draft cites
-- a specific clause, email, document, or diary entry. The draft
-- rendered to the user is the narrative interpolated with the
-- assertions, each with its own inline citation.
------------------------------------------------------------------------
CREATE TABLE claim_assertion (
  id                    CHAR(26)       NOT NULL PRIMARY KEY,
  claim_id              CHAR(26)       NOT NULL,
  display_order         INT            NOT NULL DEFAULT 0,
  assertion_text        NVARCHAR(MAX)  NOT NULL,
  cited_artifact_type   VARCHAR(24)    NOT NULL,
  cited_artifact_id     CHAR(26)       NOT NULL,
  citation_note         NVARCHAR(512)  NULL,
  confidence            VARCHAR(16)    NULL,
  generated_by_capability_version VARCHAR(64) NULL,
  created_by_user_id    CHAR(26)       NOT NULL,
  created_at            DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at            DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_claim_assert_claim   FOREIGN KEY (claim_id)           REFERENCES claim(id),
  CONSTRAINT fk_claim_assert_creator FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_claim_assert_artifact_type CHECK (
    cited_artifact_type IN ('Clause','Email','Document','SiteDiaryEntry','RecordFlag')
  ),
  CONSTRAINT ck_claim_assert_confidence CHECK (
    confidence IS NULL OR confidence IN ('high','medium','low','insufficient_context')
  )
);
CREATE INDEX ix_claim_assert_claim ON claim_assertion(claim_id, display_order);

------------------------------------------------------------------------
-- claim_clause_link / claim_email_link / claim_document_link —
-- evidence bundle pre-population links (symmetric with variation_*_link).
------------------------------------------------------------------------
CREATE TABLE claim_clause_link (
  claim_id   CHAR(26) NOT NULL,
  clause_id  CHAR(26) NOT NULL,
  CONSTRAINT pk_claim_clause_link PRIMARY KEY (claim_id, clause_id),
  CONSTRAINT fk_clcl_claim  FOREIGN KEY (claim_id)  REFERENCES claim(id),
  CONSTRAINT fk_clcl_clause FOREIGN KEY (clause_id) REFERENCES clause(id)
);

CREATE TABLE claim_email_link (
  claim_id  CHAR(26) NOT NULL,
  email_id  CHAR(26) NOT NULL,
  CONSTRAINT pk_claim_email_link PRIMARY KEY (claim_id, email_id),
  CONSTRAINT fk_clel_claim FOREIGN KEY (claim_id) REFERENCES claim(id),
  CONSTRAINT fk_clel_email FOREIGN KEY (email_id) REFERENCES email(id)
);

CREATE TABLE claim_document_link (
  claim_id     CHAR(26) NOT NULL,
  document_id  CHAR(26) NOT NULL,
  CONSTRAINT pk_claim_document_link PRIMARY KEY (claim_id, document_id),
  CONSTRAINT fk_cldl_claim FOREIGN KEY (claim_id)    REFERENCES claim(id),
  CONSTRAINT fk_cldl_doc   FOREIGN KEY (document_id) REFERENCES document(id)
);
