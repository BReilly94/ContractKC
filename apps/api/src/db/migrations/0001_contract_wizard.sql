-- Migration: 0001_contract_wizard
-- Scope: Initial schema for SOW §5.1 item 1 (Contract creation wizard).
-- Target: SQL Server 2022.
-- Conventions (from data-model.md §1): ULIDs as CHAR(26), money as BIGINT cents + CHAR(3) currency,
-- timestamps as DATETIMEOFFSET (UTC), enums as VARCHAR with CHECK constraints.

------------------------------------------------------------------------
-- app_user
------------------------------------------------------------------------
CREATE TABLE app_user (
  id                        CHAR(26)      NOT NULL PRIMARY KEY,
  email                     VARCHAR(320)  NOT NULL,
  display_name              NVARCHAR(128) NOT NULL,
  global_role               VARCHAR(40)   NOT NULL,
  is_pm                     BIT           NOT NULL DEFAULT 0,
  can_create_contracts      BIT           NOT NULL DEFAULT 0,
  created_at                DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT uq_app_user_email UNIQUE (email),
  CONSTRAINT ck_app_user_global_role CHECK (
    global_role IN ('SystemAdministrator','KnowledgeCentreAdministrator','Auditor','Standard')
  )
);

CREATE INDEX ix_app_user_is_pm ON app_user(is_pm) WHERE is_pm = 1;

------------------------------------------------------------------------
-- party
------------------------------------------------------------------------
CREATE TABLE party (
  id                  CHAR(26)       NOT NULL PRIMARY KEY,
  name                NVARCHAR(256)  NOT NULL,
  created_by_user_id  CHAR(26)       NOT NULL,
  created_at          DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_party_created_by FOREIGN KEY (created_by_user_id) REFERENCES app_user(id)
);

CREATE INDEX ix_party_name ON party(name);

------------------------------------------------------------------------
-- contract
-- Note: summary_id FK is added after contract_summary is created.
------------------------------------------------------------------------
CREATE TABLE contract (
  id                       CHAR(26)       NOT NULL PRIMARY KEY,
  name                     NVARCHAR(256)  NOT NULL,
  client_party_id          CHAR(26)       NOT NULL,
  responsible_pm_user_id   CHAR(26)       NOT NULL,
  contract_value_cents     BIGINT         NULL,
  currency                 CHAR(3)        NOT NULL,
  start_date               DATE           NOT NULL,
  end_date                 DATE           NULL,
  governing_law            VARCHAR(40)    NOT NULL,
  confidentiality_class    VARCHAR(32)    NOT NULL DEFAULT 'Standard',
  language                 VARCHAR(10)    NOT NULL DEFAULT 'en',
  lifecycle_state          VARCHAR(32)    NOT NULL DEFAULT 'Onboarding',
  vector_namespace         VARCHAR(128)   NOT NULL,
  project_email_address    VARCHAR(320)   NOT NULL,
  project_email_alias      VARCHAR(320)   NULL,
  summary_id               CHAR(26)       NULL,
  created_at               DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at               DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_contract_client_party   FOREIGN KEY (client_party_id)        REFERENCES party(id),
  CONSTRAINT fk_contract_responsible_pm FOREIGN KEY (responsible_pm_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_contract_vector_namespace UNIQUE (vector_namespace),
  CONSTRAINT uq_contract_project_email    UNIQUE (project_email_address),
  CONSTRAINT ck_contract_confidentiality CHECK (
    confidentiality_class IN ('Standard','Restricted','HighlyRestricted')
  ),
  CONSTRAINT ck_contract_lifecycle CHECK (
    lifecycle_state IN ('Draft','Onboarding','Active','IssueInProgress','Closeout','Archived')
  ),
  CONSTRAINT ck_contract_value_cents_nonneg CHECK (
    contract_value_cents IS NULL OR contract_value_cents >= 0
  ),
  CONSTRAINT ck_contract_end_after_start CHECK (
    end_date IS NULL OR end_date >= start_date
  ),
  CONSTRAINT ck_contract_currency_len CHECK (LEN(currency) = 3)
);

CREATE INDEX ix_contract_client_party    ON contract(client_party_id);
CREATE INDEX ix_contract_responsible_pm  ON contract(responsible_pm_user_id);
CREATE INDEX ix_contract_lifecycle_state ON contract(lifecycle_state);

------------------------------------------------------------------------
-- contract_summary
------------------------------------------------------------------------
CREATE TABLE contract_summary (
  id                                CHAR(26)       NOT NULL PRIMARY KEY,
  contract_id                       CHAR(26)       NOT NULL,
  verification_state                VARCHAR(16)    NOT NULL DEFAULT 'Unverified',
  content_json                      NVARCHAR(MAX)  NULL,
  verified_by_user_id               CHAR(26)       NULL,
  verified_at                       DATETIMEOFFSET NULL,
  generated_by_capability_version   VARCHAR(64)    NULL,
  generated_at                      DATETIMEOFFSET NULL,
  CONSTRAINT fk_contract_summary_contract    FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_contract_summary_verified_by FOREIGN KEY (verified_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_contract_summary_state CHECK (
    verification_state IN ('Unverified','Verified','Superseded')
  ),
  CONSTRAINT ck_contract_summary_verified_fields CHECK (
    verification_state <> 'Verified'
    OR (verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE INDEX ix_contract_summary_contract ON contract_summary(contract_id);

ALTER TABLE contract
  ADD CONSTRAINT fk_contract_summary_id FOREIGN KEY (summary_id) REFERENCES contract_summary(id);

------------------------------------------------------------------------
-- contract_access
------------------------------------------------------------------------
CREATE TABLE contract_access (
  id                  CHAR(26)       NOT NULL PRIMARY KEY,
  contract_id         CHAR(26)       NOT NULL,
  user_id             CHAR(26)       NOT NULL,
  contract_role       VARCHAR(32)    NOT NULL,
  granted_by_user_id  CHAR(26)       NOT NULL,
  granted_at          DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_contract_access_contract   FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_contract_access_user       FOREIGN KEY (user_id)             REFERENCES app_user(id),
  CONSTRAINT fk_contract_access_granted_by FOREIGN KEY (granted_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT uq_contract_access_unique_grant UNIQUE (contract_id, user_id),
  CONSTRAINT ck_contract_role CHECK (
    contract_role IN ('Owner','Administrator','Contributor','Viewer','RestrictedViewer')
  )
);

CREATE INDEX ix_contract_access_user_contract ON contract_access(user_id, contract_id);

------------------------------------------------------------------------
-- contract_access_revocation
------------------------------------------------------------------------
CREATE TABLE contract_access_revocation (
  id                    CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id           CHAR(26)        NOT NULL,
  user_id               CHAR(26)        NOT NULL,
  revoked_by_user_id    CHAR(26)        NOT NULL,
  revoked_at            DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  reason_category       VARCHAR(40)     NOT NULL,
  reason_note           NVARCHAR(2000)  NULL,
  reversed_at           DATETIMEOFFSET  NULL,
  reversed_by_user_id   CHAR(26)        NULL,
  CONSTRAINT fk_car_contract      FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_car_user          FOREIGN KEY (user_id)             REFERENCES app_user(id),
  CONSTRAINT fk_car_revoked_by    FOREIGN KEY (revoked_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT fk_car_reversed_by   FOREIGN KEY (reversed_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_car_reason CHECK (
    reason_category IN ('ConflictOfInterest','RoleChange','LegalInstruction','EthicalWall','Other')
  ),
  CONSTRAINT ck_car_reversed_consistent CHECK (
    (reversed_at IS NULL AND reversed_by_user_id IS NULL)
    OR (reversed_at IS NOT NULL AND reversed_by_user_id IS NOT NULL)
  )
);

CREATE INDEX ix_car_active_user_contract
  ON contract_access_revocation(user_id, contract_id)
  WHERE reversed_at IS NULL;

------------------------------------------------------------------------
-- email_alias
------------------------------------------------------------------------
CREATE TABLE email_alias (
  id                       CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id              CHAR(26)        NOT NULL,
  local_part               VARCHAR(64)     NOT NULL,
  canonical_address        VARCHAR(320)    NOT NULL,
  human_alias              VARCHAR(64)     NULL,
  alias_type               VARCHAR(16)     NOT NULL,
  active                   BIT             NOT NULL DEFAULT 1,
  provisioned_externally   BIT             NOT NULL DEFAULT 0,
  created_at               DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  deactivated_at           DATETIMEOFFSET  NULL,
  CONSTRAINT fk_email_alias_contract FOREIGN KEY (contract_id) REFERENCES contract(id),
  CONSTRAINT uq_email_alias_local_part UNIQUE (local_part),
  CONSTRAINT ck_email_alias_type CHECK (alias_type IN ('Canonical','Human'))
);

CREATE INDEX ix_email_alias_contract ON email_alias(contract_id);
CREATE INDEX ix_email_alias_active_contract ON email_alias(contract_id) WHERE active = 1;

------------------------------------------------------------------------
-- contract_lifecycle_transition (reference data — legal FSM edges)
------------------------------------------------------------------------
CREATE TABLE contract_lifecycle_transition (
  from_state VARCHAR(32) NOT NULL,
  to_state   VARCHAR(32) NOT NULL,
  CONSTRAINT pk_contract_lifecycle_transition PRIMARY KEY (from_state, to_state),
  CONSTRAINT ck_lct_from CHECK (
    from_state IN ('Draft','Onboarding','Active','IssueInProgress','Closeout','Archived')
  ),
  CONSTRAINT ck_lct_to CHECK (
    to_state IN ('Draft','Onboarding','Active','IssueInProgress','Closeout','Archived')
  )
);

INSERT INTO contract_lifecycle_transition (from_state, to_state) VALUES
  ('Draft',            'Onboarding'),
  ('Onboarding',       'Active'),
  ('Active',           'IssueInProgress'),
  ('IssueInProgress',  'Active'),
  ('Active',           'Closeout'),
  ('IssueInProgress',  'Closeout'),
  ('Closeout',         'Archived');
