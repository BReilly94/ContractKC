-- Migration: 0002_audit_log
-- Non-Negotiable #4: append-only audit log, enforced at the DB layer.
-- Local-dev enforcement: INSTEAD OF UPDATE / DELETE triggers block mutation regardless of user.
-- Azure-cutover TODO: add role-based grants per security.md §8 (Q-P0-grants).

CREATE TABLE audit_log (
  sequence_number  BIGINT          IDENTITY(1,1) NOT NULL PRIMARY KEY,
  id               CHAR(26)        NOT NULL,
  actor_user_id    CHAR(26)        NOT NULL,
  action           VARCHAR(64)     NOT NULL,
  entity_type      VARCHAR(40)     NOT NULL,
  entity_id        VARCHAR(64)     NOT NULL,
  before_json      NVARCHAR(MAX)   NULL,
  after_json       NVARCHAR(MAX)   NULL,
  correlation_id   CHAR(26)        NOT NULL,
  created_at       DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  prev_hash        CHAR(64)        NULL,
  row_hash         CHAR(64)        NOT NULL,
  CONSTRAINT uq_audit_log_id UNIQUE (id),
  CONSTRAINT fk_audit_log_actor FOREIGN KEY (actor_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_audit_log_entity_type CHECK (
    entity_type IN (
      'Contract',
      'ContractSummary',
      'ContractAccess',
      'ContractAccessRevocation',
      'EmailAlias',
      'Party',
      'User'
    )
  ),
  CONSTRAINT ck_audit_log_action CHECK (
    action IN (
      'contract.create',
      'contract.update',
      'contract.lifecycle.transition',
      'contract_summary.create',
      'contract_summary.verify',
      'contract_access.grant',
      'contract_access.revoke',
      'contract_access.revocation.reverse',
      'email_alias.create',
      'email_alias.deactivate',
      'party.create',
      'user.create'
    )
  )
);

CREATE INDEX ix_audit_log_entity       ON audit_log(entity_type, entity_id);
CREATE INDEX ix_audit_log_correlation  ON audit_log(correlation_id);
CREATE INDEX ix_audit_log_created_at   ON audit_log(created_at);
GO

CREATE TRIGGER trg_audit_log_no_update ON audit_log
INSTEAD OF UPDATE
AS
BEGIN
  RAISERROR('audit_log is append-only; UPDATE is not permitted (Non-Negotiable #4)', 16, 1);
  ROLLBACK TRANSACTION;
END;
GO

CREATE TRIGGER trg_audit_log_no_delete ON audit_log
INSTEAD OF DELETE
AS
BEGIN
  RAISERROR('audit_log is append-only; DELETE is not permitted (Non-Negotiable #4)', 16, 1);
  ROLLBACK TRANSACTION;
END;
GO
