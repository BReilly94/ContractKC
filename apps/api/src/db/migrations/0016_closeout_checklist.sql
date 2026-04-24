-- Migration: 0016_closeout_checklist
-- Scope: Slice HH — §3.23, §6.21, §8.11 Project Closeout Checklist.
--
-- Each contract gets a checklist instantiated from a template; templates
-- are per-kind (EPC / Construction / Supply / Services) and ship seeded
-- below so new contracts have immediate defaults.
--
-- Archive gate (§6.21): Contract cannot transition Closeout → Archived
-- unless every item is either Signed or Waived. The gate is enforced in
-- the service layer (CloseoutService.assertArchiveAllowed) because the
-- contract transition lives in ContractsService.

------------------------------------------------------------------------
-- closeout_template
-- items is a JSON array of { itemKey, title, description }. Keep it flat
-- so seeding and admin edits are simple; structured relational items is
-- an over-engineering for the template layer.
------------------------------------------------------------------------
CREATE TABLE closeout_template (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  kind                    VARCHAR(24)     NOT NULL,
  name                    NVARCHAR(256)   NOT NULL,
  items                   NVARCHAR(MAX)   NOT NULL,
  created_by_user_id      CHAR(26)        NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_closeout_template_creator
    FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT ck_closeout_template_kind CHECK (
    kind IN ('EPC','Construction','Supply','Services')
  )
);
CREATE INDEX ix_closeout_template_kind ON closeout_template(kind);

------------------------------------------------------------------------
-- closeout_checklist — one per contract at any time.
-- The generated_certificate_blob_path is populated by generateCertificate
-- (the certificate PDF itself is a TODO — writing the record is the Phase 2
-- commitment; actual PDF rendering lands with the portfolio generator).
------------------------------------------------------------------------
CREATE TABLE closeout_checklist (
  id                                CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id                       CHAR(26)        NOT NULL,
  template_id                       CHAR(26)        NOT NULL,
  generated_certificate_blob_path   NVARCHAR(1024)  NULL,
  certificate_generated_at          DATETIMEOFFSET  NULL,
  certificate_generated_by_user_id  CHAR(26)        NULL,
  created_at                        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_closeout_checklist_contract
    FOREIGN KEY (contract_id) REFERENCES contract(id),
  CONSTRAINT fk_closeout_checklist_template
    FOREIGN KEY (template_id) REFERENCES closeout_template(id),
  CONSTRAINT fk_closeout_checklist_cert_generator
    FOREIGN KEY (certificate_generated_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_closeout_checklist_contract UNIQUE (contract_id)
);
CREATE INDEX ix_closeout_checklist_contract ON closeout_checklist(contract_id);

------------------------------------------------------------------------
-- closeout_checklist_item
-- status Pending → Signed | Waived. Waive requires a reason (enforced
-- at both the check constraint and the service layer).
------------------------------------------------------------------------
CREATE TABLE closeout_checklist_item (
  id                      CHAR(26)        NOT NULL PRIMARY KEY,
  checklist_id            CHAR(26)        NOT NULL,
  item_key                VARCHAR(64)     NOT NULL,
  title                   NVARCHAR(256)   NOT NULL,
  description             NVARCHAR(MAX)   NULL,
  owner_user_id           CHAR(26)        NULL,
  status                  VARCHAR(16)     NOT NULL DEFAULT 'Pending',
  signed_at               DATETIMEOFFSET  NULL,
  signed_by_user_id       CHAR(26)        NULL,
  waive_reason            NVARCHAR(1024)  NULL,
  waived_at               DATETIMEOFFSET  NULL,
  waived_by_user_id       CHAR(26)        NULL,
  created_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at              DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_closeout_item_checklist
    FOREIGN KEY (checklist_id) REFERENCES closeout_checklist(id),
  CONSTRAINT fk_closeout_item_owner
    FOREIGN KEY (owner_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_closeout_item_signer
    FOREIGN KEY (signed_by_user_id) REFERENCES app_user(id),
  CONSTRAINT fk_closeout_item_waiver
    FOREIGN KEY (waived_by_user_id) REFERENCES app_user(id),
  CONSTRAINT uq_closeout_item_checklist_key UNIQUE (checklist_id, item_key),
  CONSTRAINT ck_closeout_item_status CHECK (status IN ('Pending','Signed','Waived')),
  CONSTRAINT ck_closeout_item_waive_reason CHECK (
    status <> 'Waived' OR (waive_reason IS NOT NULL AND waived_at IS NOT NULL)
  ),
  CONSTRAINT ck_closeout_item_signed_stamps CHECK (
    status <> 'Signed' OR (signed_at IS NOT NULL AND signed_by_user_id IS NOT NULL)
  )
);
CREATE INDEX ix_closeout_item_checklist ON closeout_checklist_item(checklist_id);
CREATE INDEX ix_closeout_item_open
  ON closeout_checklist_item(checklist_id)
  WHERE status = 'Pending';

------------------------------------------------------------------------
-- Seed the four starter templates.
-- IDs use the 'CLSEOUT' prefix so they're recognisable in logs without
-- colliding with real ULIDs at create time.
------------------------------------------------------------------------
INSERT INTO closeout_template (id, kind, name, items, created_by_user_id) VALUES
  (
    '01HXCLSEOUTSEED00000000EPC',
    'EPC',
    'EPC default closeout',
    N'[
      {"itemKey":"final_deliverables","title":"Final deliverables handed over","description":"All Schedule A deliverables delivered, inspected, and accepted."},
      {"itemKey":"performance_testing","title":"Performance testing complete","description":"Acceptance tests run against the contract performance criteria."},
      {"itemKey":"final_payment","title":"Final payment certified","description":"Final progress claim certified and paid or held under dispute."},
      {"itemKey":"warranties","title":"Warranties issued","description":"Manufacturer and contractor warranties transferred."},
      {"itemKey":"as_builts","title":"As-built drawings delivered","description":"Final marked-up drawings collected from the engineer and filed."},
      {"itemKey":"om_manuals","title":"O&M manuals delivered","description":"Operations and maintenance documentation delivered to client."},
      {"itemKey":"demobilisation","title":"Demobilisation complete","description":"Site cleared; laydown areas handed back to the client."},
      {"itemKey":"lien_waivers","title":"Lien waivers collected","description":"Final lien waivers from Technica and all subcontractors."},
      {"itemKey":"final_account","title":"Final account settled","description":"All variations, claims, and back-charges resolved in the final account."},
      {"itemKey":"claims_resolved","title":"Claims resolved","description":"Every open claim on this contract closed out."},
      {"itemKey":"client_signoff","title":"Client sign-off","description":"Written acceptance from the Contract Administrator."},
      {"itemKey":"closeout_certificate","title":"Closeout certificate generated","description":"Certificate produced by the system and shared with client."},
      {"itemKey":"archival","title":"Archival complete","description":"All contract records archived in TKC with retention tag applied."}
    ]',
    NULL
  ),
  (
    '01HXCLSEOUTSEED0CONSTRUCT0',
    'Construction',
    'Construction default closeout',
    N'[
      {"itemKey":"substantial_completion","title":"Substantial completion certified","description":"Substantial completion certificate issued by the consultant."},
      {"itemKey":"deficiency_list","title":"Deficiency list closed","description":"All line items on the deficiency list signed off."},
      {"itemKey":"as_builts","title":"As-built drawings delivered","description":"Marked-up set collected and transmitted to the owner."},
      {"itemKey":"om_manuals","title":"O&M manuals delivered","description":"Owner has received all manuals and warranties."},
      {"itemKey":"final_payment","title":"Final payment certified","description":"Final progress claim approved or disputed on record."},
      {"itemKey":"warranties","title":"Warranties issued","description":"Owner holds all equipment and workmanship warranties."},
      {"itemKey":"lien_waivers","title":"Lien waivers collected","description":"Statutory lien waiver window satisfied."},
      {"itemKey":"demobilisation","title":"Demobilisation complete","description":"Site handed back; temporary facilities removed."},
      {"itemKey":"claims_resolved","title":"Claims resolved","description":"Every open claim closed."},
      {"itemKey":"client_signoff","title":"Client sign-off","description":"Consultant/owner signed the closeout letter."},
      {"itemKey":"closeout_certificate","title":"Closeout certificate generated","description":"System-generated certificate attached."},
      {"itemKey":"archival","title":"Archival complete","description":"Records archived."}
    ]',
    NULL
  ),
  (
    '01HXCLSEOUTSEED000SUPPLY00',
    'Supply',
    'Supply default closeout',
    N'[
      {"itemKey":"delivery_accepted","title":"All supplied items delivered and accepted","description":"Packing slips signed and matched against the PO."},
      {"itemKey":"warranties","title":"Warranties issued","description":"Manufacturer warranties transferred to client."},
      {"itemKey":"final_payment","title":"Final payment certified","description":"Final invoice paid or disputed."},
      {"itemKey":"spare_parts","title":"Spare parts and consumables delivered","description":"Per contract Schedule on spares."},
      {"itemKey":"claims_resolved","title":"Claims resolved","description":"Back-orders, shortages, and damage claims closed."},
      {"itemKey":"client_signoff","title":"Client sign-off","description":"Client acknowledges complete delivery."},
      {"itemKey":"closeout_certificate","title":"Closeout certificate generated","description":"Certificate produced and shared."},
      {"itemKey":"archival","title":"Archival complete","description":"Records archived."}
    ]',
    NULL
  ),
  (
    '01HXCLSEOUTSEED00SERVICES0',
    'Services',
    'Services default closeout',
    N'[
      {"itemKey":"scope_complete","title":"Scope of services complete","description":"All deliverables per Schedule A delivered."},
      {"itemKey":"final_deliverables","title":"Final deliverables accepted","description":"Reports, studies, designs accepted by client."},
      {"itemKey":"final_payment","title":"Final payment certified","description":"Final fee claim paid or disputed on record."},
      {"itemKey":"warranties","title":"Professional indemnity maintained","description":"PI coverage confirmed for the tail period per contract."},
      {"itemKey":"claims_resolved","title":"Claims resolved","description":"Disputed fees or scope items closed out."},
      {"itemKey":"client_signoff","title":"Client sign-off","description":"Client confirmed services complete."},
      {"itemKey":"closeout_certificate","title":"Closeout certificate generated","description":"Certificate produced and shared."},
      {"itemKey":"archival","title":"Archival complete","description":"Records archived."}
    ]',
    NULL
  );

------------------------------------------------------------------------
-- audit_log expansion
-- Rewrites both CHECK constraints with the closeout additions. Keep the
-- latest whitelist in sync with packages/domain/src/audit.ts.
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
    'Risk','Interpretation',
    'PaymentApplication','Policy',
    'SiteDiaryEntry',
    'RecordFlag',
    'CorrespondenceTemplate','OutboundCorrespondence',
    'CloseoutTemplate','CloseoutChecklist','CloseoutChecklistItem'
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
    'submittal.create','submittal.update','submittal.lifecycle.transition','submittal.link',
    'redaction.apply','redaction.reverse',
    'risk.create','risk.update','risk.delete',
    'interpretation.create','interpretation.update','interpretation.delete',
    'payment_application.create','payment_application.update','payment_application.transition',
    'policy.create','policy.update','policy.delete',
    'diary.create','diary.update','diary.conflict.record','diary.conflict.reconcile',
    'record_flag.create','record_flag.update','record_flag.delete','record_flag.hold_point.release',
    'correspondence_template.create','correspondence_template.update',
    'outbound_correspondence.draft','outbound_correspondence.send',
    'outbound_correspondence.send_failed','outbound_correspondence.recall',
    'closeout_template.create','closeout.checklist.create',
    'closeout.item.sign','closeout.item.waive','closeout.certificate.generate'
  )
);
