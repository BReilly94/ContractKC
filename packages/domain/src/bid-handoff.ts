import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';
import type { RiskCategory, RiskLikelihood } from './risk.js';

/**
 * Authority level mirrors `contacts.service.ts` AuthorityLevel. Kept here
 * as a plain string-literal union so the domain package stays free of
 * app-layer imports. Any change to this list must sync the contacts module.
 */
export type BidHandoffAuthorityLevel =
  | 'CanDirectExtraWork'
  | 'CanIssueSiteInstructions'
  | 'CanApproveVariations'
  | 'Administrative';

/**
 * Bid-to-Contract Handoff (SOW §3.1 item 2, §6.1, §7.7).
 *
 * Defines the canonical schema the Bid Intake & Generation application
 * sends to CKB at bid-win. The schema is intentionally narrow: CKB owns
 * what happens with the payload (risks → risk register, correspondence
 * → document ingestion, contacts → contact directory), while the bid app
 * owns what it ships. Fields are kept as plain Zod-shaped interfaces here
 * so `apps/api` and the Zod parser stay aligned without a duplicated
 * schema file.
 *
 * Every downstream entity that feeds alerts (risks in particular) lands
 * as Unverified and requires human verification (Non-Negotiable #2).
 */

export type BidHandoffId = BrandedId<'BidHandoff'>;

export type BidHandoffStatus = 'Received' | 'Processed' | 'Failed';

export interface BidHandoffWinningProposal {
  readonly bidTitle: string;
  readonly bidValueCents: number | null;
  readonly currency: string | null;
  readonly submittedAt: string | null;
  readonly winNoticeReceivedAt: string | null;
  readonly scopeSummary: string | null;
}

export interface BidHandoffEstimate {
  readonly label: string;
  readonly amountCents: number | null;
  readonly currency: string | null;
  readonly basis: string | null;
}

export interface BidHandoffQualification {
  readonly title: string;
  readonly detail: string;
}

export interface BidHandoffAssumption {
  readonly title: string;
  readonly detail: string;
}

export interface BidHandoffRiskItem {
  readonly title: string;
  readonly description: string | null;
  readonly category: RiskCategory;
  readonly probability: RiskLikelihood;
  readonly impact: RiskLikelihood;
  readonly mitigation: string | null;
}

export interface BidHandoffCorrespondenceItem {
  readonly kind: 'Email' | 'Document';
  readonly subjectOrTitle: string;
  readonly sentAt: string | null;
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly contentBase64: string;
  readonly fromAddress: string | null;
  readonly toAddresses: readonly string[] | null;
}

export interface BidHandoffContact {
  readonly name: string;
  readonly roleTitle: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly authorityLevel: BidHandoffAuthorityLevel;
  readonly notes: string | null;
}

export interface BidHandoffPayload {
  readonly bidId: string;
  readonly sourceSystem: string;
  readonly winningProposal: BidHandoffWinningProposal;
  readonly estimates: readonly BidHandoffEstimate[];
  readonly assumptions: readonly BidHandoffAssumption[];
  readonly qualifications: readonly BidHandoffQualification[];
  readonly bidPhaseRisks: readonly BidHandoffRiskItem[];
  readonly keyCorrespondence: readonly BidHandoffCorrespondenceItem[];
  readonly contacts: readonly BidHandoffContact[];
}

export interface BidHandoffReceiptSummary {
  readonly id: BidHandoffId;
  readonly contractId: ContractId;
  readonly bidId: string;
  readonly sourceSystem: string;
  readonly status: BidHandoffStatus;
  readonly risksCreated: number;
  readonly contactsCreated: number;
  readonly documentsCreated: number;
  readonly receivedAt: Date;
  readonly receivedByUserId: UserId | null;
}
