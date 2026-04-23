-- Migration: 0007_contacts
-- Scope: §5.7 per-contract contact directory with authority levels.
--
-- A contact is a named individual tied to a contract and optionally to a
-- party. Authority level drives UI affordances at the point of decision
-- (§5.7.3) — e.g., the email viewer flags "can direct extra work" next to
-- the sender's name.

CREATE TABLE contract_contact (
  id                  CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id         CHAR(26)        NOT NULL,
  party_id            CHAR(26)        NULL,  -- organization; optional
  name                NVARCHAR(256)   NOT NULL,
  role_title          NVARCHAR(256)   NULL,
  email               NVARCHAR(320)   NULL,
  phone               NVARCHAR(64)    NULL,
  authority_level     VARCHAR(40)     NOT NULL DEFAULT 'Administrative',
  notes               NVARCHAR(2000)  NULL,
  created_by_user_id  CHAR(26)        NOT NULL,
  created_at          DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at          DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_contact_contract FOREIGN KEY (contract_id)        REFERENCES contract(id),
  CONSTRAINT fk_contact_party    FOREIGN KEY (party_id)           REFERENCES party(id),
  CONSTRAINT fk_contact_creator  FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_contact_authority CHECK (
    authority_level IN (
      'CanDirectExtraWork',
      'CanIssueSiteInstructions',
      'CanApproveVariations',
      'Administrative'
    )
  )
);

CREATE INDEX ix_contact_contract       ON contract_contact(contract_id);
CREATE INDEX ix_contact_email          ON contract_contact(email) WHERE email IS NOT NULL;
CREATE INDEX ix_contact_authority      ON contract_contact(contract_id, authority_level);

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
    'ContractContact'
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
    'contact.create','contact.update','contact.delete'
  )
);
