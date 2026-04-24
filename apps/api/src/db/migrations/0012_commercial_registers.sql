-- Migration: 0012_commercial_registers
-- Scope: Slice S — Commercial registers:
--   §3.11 Variation / Change Order Register (extends Slice Q skeleton)
--   §3.4  Risk Register
--   §3.13 Interpretation / Decision Log

------------------------------------------------------------------------
-- variation — extend with commercial fields + evidence links
------------------------------------------------------------------------
ALTER TABLE variation ADD
  description               NVARCHAR(MAX) NULL,
  priced_amount_cents       BIGINT        NULL,
  approved_amount_cents     BIGINT        NULL,
  disputed_at               DATETIMEOFFSET NULL,
  originating_instruction   NVARCHAR(1024) NULL;

CREATE TABLE variation_clause_link (
  variation_id CHAR(26) NOT NULL,
  clause_id    CHAR(26) NOT NULL,
  CONSTRAINT pk_variation_clause_link PRIMARY KEY (variation_id, clause_id),
  CONSTRAINT fk_vcl_variation FOREIGN KEY (variation_id) REFERENCES variation(id),
  CONSTRAINT fk_vcl_clause    FOREIGN KEY (clause_id)    REFERENCES clause(id)
);

CREATE TABLE variation_email_link (
  variation_id CHAR(26) NOT NULL,
  email_id     CHAR(26) NOT NULL,
  CONSTRAINT pk_variation_email_link PRIMARY KEY (variation_id, email_id),
  CONSTRAINT fk_vel_variation FOREIGN KEY (variation_id) REFERENCES variation(id),
  CONSTRAINT fk_vel_email     FOREIGN KEY (email_id)     REFERENCES email(id)
);

CREATE TABLE variation_document_link (
  variation_id CHAR(26) NOT NULL,
  document_id  CHAR(26) NOT NULL,
  CONSTRAINT pk_variation_document_link PRIMARY KEY (variation_id, document_id),
  CONSTRAINT fk_vdl_variation FOREIGN KEY (variation_id) REFERENCES variation(id),
  CONSTRAINT fk_vdl_document  FOREIGN KEY (document_id)  REFERENCES document(id)
);

CREATE TABLE variation_claim_link (
  variation_id CHAR(26) NOT NULL,
  claim_id     CHAR(26) NOT NULL,
  CONSTRAINT pk_variation_claim_link PRIMARY KEY (variation_id, claim_id),
  CONSTRAINT fk_vclaim_variation FOREIGN KEY (variation_id) REFERENCES variation(id),
  CONSTRAINT fk_vclaim_claim     FOREIGN KEY (claim_id)     REFERENCES claim(id)
);

------------------------------------------------------------------------
-- risk — §3.4
------------------------------------------------------------------------
CREATE TABLE risk (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  title                   NVARCHAR(512)   NOT NULL,
  description             NVARCHAR(MAX)   NULL,
  category                VARCHAR(40)     NOT NULL,
  owner_user_id           CHAR(26)        NULL,
  probability             VARCHAR(8)      NOT NULL,
  impact                  VARCHAR(8)      NOT NULL,
  mitigation              NVARCHAR(MAX)   NULL,
  residual_probability    VARCHAR(8)      NULL,
  residual_impact         VARCHAR(8)      NULL,
  status                  VARCHAR(16)     NOT NULL DEFAULT 'Open',
  source                  VARCHAR(24)     NOT NULL DEFAULT 'Manual',
  created_by_user_id      CHAR(26)        NOT NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_risk_contract FOREIGN KEY (contract_id)         REFERENCES contract(id),
  CONSTRAINT fk_risk_owner    FOREIGN KEY (owner_user_id)       REFERENCES app_user(id),
  CONSTRAINT fk_risk_creator  FOREIGN KEY (created_by_user_id)  REFERENCES app_user(id),
  CONSTRAINT ck_risk_category CHECK (
    category IN ('Commercial','Schedule','Technical','Safety','Regulatory','Environmental','ClientBehaviour','Subcontractor','ForceMAjeure','Other')
  ),
  CONSTRAINT ck_risk_probability CHECK (probability IN ('Low','Medium','High')),
  CONSTRAINT ck_risk_impact      CHECK (impact IN ('Low','Medium','High')),
  CONSTRAINT ck_risk_residual_probability CHECK (residual_probability IS NULL OR residual_probability IN ('Low','Medium','High')),
  CONSTRAINT ck_risk_residual_impact      CHECK (residual_impact IS NULL OR residual_impact IN ('Low','Medium','High')),
  CONSTRAINT ck_risk_status CHECK (status IN ('Open','Mitigated','Occurred','Closed')),
  CONSTRAINT ck_risk_source CHECK (source IN ('Manual','BidHandoff','AI'))
);
CREATE INDEX ix_risk_contract ON risk(contract_id);
CREATE INDEX ix_risk_status   ON risk(contract_id, status);

------------------------------------------------------------------------
-- interpretation — §3.13
------------------------------------------------------------------------
CREATE TABLE interpretation (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id             CHAR(26)        NOT NULL,
  title                   NVARCHAR(512)   NOT NULL,
  context                 NVARCHAR(MAX)   NOT NULL,
  decision                NVARCHAR(MAX)   NOT NULL,
  decided_at              DATE            NOT NULL,
  decided_by_user_id      CHAR(26)        NOT NULL,
  primary_clause_id       CHAR(26)        NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_interp_contract   FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_interp_decider    FOREIGN KEY (decided_by_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_interp_clause     FOREIGN KEY (primary_clause_id)  REFERENCES clause(id)
);
CREATE INDEX ix_interpretation_contract ON interpretation(contract_id);

CREATE TABLE interpretation_clause_link (
  interpretation_id CHAR(26) NOT NULL,
  clause_id         CHAR(26) NOT NULL,
  CONSTRAINT pk_interp_clause_link PRIMARY KEY (interpretation_id, clause_id),
  CONSTRAINT fk_icl_interp FOREIGN KEY (interpretation_id) REFERENCES interpretation(id),
  CONSTRAINT fk_icl_clause FOREIGN KEY (clause_id)         REFERENCES clause(id)
);

CREATE TABLE interpretation_email_link (
  interpretation_id CHAR(26) NOT NULL,
  email_id          CHAR(26) NOT NULL,
  CONSTRAINT pk_interp_email_link PRIMARY KEY (interpretation_id, email_id),
  CONSTRAINT fk_iel_interp FOREIGN KEY (interpretation_id) REFERENCES interpretation(id),
  CONSTRAINT fk_iel_email  FOREIGN KEY (email_id)          REFERENCES email(id)
);

CREATE TABLE interpretation_document_link (
  interpretation_id CHAR(26) NOT NULL,
  document_id       CHAR(26) NOT NULL,
  CONSTRAINT pk_interp_document_link PRIMARY KEY (interpretation_id, document_id),
  CONSTRAINT fk_idl_interp   FOREIGN KEY (interpretation_id) REFERENCES interpretation(id),
  CONSTRAINT fk_idl_document FOREIGN KEY (document_id)       REFERENCES document(id)
);

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
    'Risk','Interpretation'
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
    'submittal.create','submittal.update','submittal.lifecycle.transition',
    'redaction.apply','redaction.reverse',
    'risk.create','risk.update','risk.delete',
    'interpretation.create','interpretation.update','interpretation.delete'
  )
);
