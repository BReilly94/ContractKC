-- Migration: 0006_clauses
-- Scope: §5.6 clause entities + cross-reference graph.

CREATE TABLE clause (
  id                                CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id                       CHAR(26)        NOT NULL,
  source_document_id                CHAR(26)        NOT NULL,
  source_document_version_id        CHAR(26)        NULL,
  clause_number                     NVARCHAR(64)    NULL,
  heading                           NVARCHAR(256)   NULL,
  page_start                        INT             NULL,
  page_end                          INT             NULL,
  char_offset_start                 INT             NULL,
  char_offset_end                   INT             NULL,
  [text]                            NVARCHAR(MAX)   NOT NULL,
  clause_type                       VARCHAR(40)     NOT NULL,
  extracted_by_capability_version   VARCHAR(64)     NULL,
  extraction_confidence             VARCHAR(16)     NOT NULL DEFAULT 'Medium',
  verification_state                VARCHAR(16)     NOT NULL DEFAULT 'Unverified',
  verified_by_user_id               CHAR(26)        NULL,
  verified_at                       DATETIMEOFFSET  NULL,
  supersedes_clause_id              CHAR(26)        NULL,
  is_superseded                     BIT             NOT NULL DEFAULT 0,
  created_at                        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_clause_contract    FOREIGN KEY (contract_id)               REFERENCES contract(id),
  CONSTRAINT fk_clause_document    FOREIGN KEY (source_document_id)        REFERENCES document(id),
  CONSTRAINT fk_clause_version     FOREIGN KEY (source_document_version_id) REFERENCES document_version(id),
  CONSTRAINT fk_clause_verified    FOREIGN KEY (verified_by_user_id)       REFERENCES app_user(id),
  CONSTRAINT fk_clause_supersedes  FOREIGN KEY (supersedes_clause_id)      REFERENCES clause(id),
  CONSTRAINT ck_clause_type CHECK (
    clause_type IN (
      'NoticeProvision','Payment','Variation','Termination','LiquidatedDamages',
      'DisputeResolution','Indemnity','Insurance','GoverningLaw','Other'
    )
  ),
  CONSTRAINT ck_clause_confidence CHECK (
    extraction_confidence IN ('High','Medium','Low','high','medium','low')
  ),
  CONSTRAINT ck_clause_verification CHECK (
    verification_state IN ('Unverified','Verified')
  )
);

CREATE INDEX ix_clause_contract         ON clause(contract_id);
CREATE INDEX ix_clause_document         ON clause(source_document_id);
CREATE INDEX ix_clause_type_contract    ON clause(contract_id, clause_type);

CREATE TABLE clause_relationship (
  id                    CHAR(26)        NOT NULL PRIMARY KEY,
  from_clause_id        CHAR(26)        NOT NULL,
  to_clause_id          CHAR(26)        NULL,
  to_email_id           CHAR(26)        NULL,
  to_document_id        CHAR(26)        NULL,
  relationship          VARCHAR(24)     NOT NULL,
  created_by            VARCHAR(8)      NOT NULL,
  created_by_user_id    CHAR(26)        NULL,
  capability_version    VARCHAR(64)     NULL,
  confidence            VARCHAR(16)     NULL,
  verification_state    VARCHAR(16)     NOT NULL DEFAULT 'Unverified',
  created_at            DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_cr_from     FOREIGN KEY (from_clause_id)     REFERENCES clause(id),
  CONSTRAINT fk_cr_to_c     FOREIGN KEY (to_clause_id)       REFERENCES clause(id),
  CONSTRAINT fk_cr_to_e     FOREIGN KEY (to_email_id)        REFERENCES email(id),
  CONSTRAINT fk_cr_to_d     FOREIGN KEY (to_document_id)     REFERENCES document(id),
  CONSTRAINT fk_cr_creator  FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_cr_rel CHECK (
    relationship IN ('References','Amends','Supersedes','CitedIn','Interprets','Contradicts')
  ),
  CONSTRAINT ck_cr_createdby CHECK (created_by IN ('AI','Human')),
  CONSTRAINT ck_cr_verification CHECK (verification_state IN ('Unverified','Verified')),
  CONSTRAINT ck_cr_exactly_one_to CHECK (
    (CASE WHEN to_clause_id   IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN to_email_id    IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN to_document_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX ix_cr_from     ON clause_relationship(from_clause_id, relationship);
CREATE INDEX ix_cr_to_c     ON clause_relationship(to_clause_id)   WHERE to_clause_id   IS NOT NULL;
CREATE INDEX ix_cr_to_e     ON clause_relationship(to_email_id)    WHERE to_email_id    IS NOT NULL;
CREATE INDEX ix_cr_to_d     ON clause_relationship(to_document_id) WHERE to_document_id IS NOT NULL;

------------------------------------------------------------------------
-- audit_log expansion for clause actions
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
    'Clause','ClauseRelationship'
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
    'clause.extract','clause.verify','clause_relationship.create','clause_relationship.verify'
  )
);
