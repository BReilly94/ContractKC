-- Add BidDocument as a first-class document category (§6.1).
-- Used for bid-phase documents manually uploaded before the Bid Intake &
-- Generation application integration is live. Documents pushed by the bid
-- app via the handoff API carry source='BidHandoff'; documents uploaded
-- manually through the Bid Documents panel carry category='BidDocument'.
--
-- SQL Server requires DROP + ADD to alter a CHECK constraint.

ALTER TABLE document DROP CONSTRAINT ck_document_category;

ALTER TABLE document ADD CONSTRAINT ck_document_category CHECK (
  category IN (
    'MasterAgreement', 'Schedule', 'Appendix', 'Amendment',
    'Drawing', 'Specification', 'NegotiationRecord',
    'Correspondence', 'Permit', 'Insurance', 'Bond', 'Other',
    'MeetingMinutes', 'BidDocument'
  )
);
