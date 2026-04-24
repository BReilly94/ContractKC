import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Risk register (SOW §3.4). Pre-populated from bid handoff (Slice Y) and
 * maintained through the life of the contract.
 */

export type RiskId = BrandedId<'Risk'>;

export type RiskCategory =
  | 'Commercial'
  | 'Schedule'
  | 'Technical'
  | 'Safety'
  | 'Regulatory'
  | 'Environmental'
  | 'ClientBehaviour'
  | 'Subcontractor'
  | 'ForceMAjeure'
  | 'Other';

export type RiskLikelihood = 'Low' | 'Medium' | 'High';
export type RiskStatus = 'Open' | 'Mitigated' | 'Occurred' | 'Closed';
export type RiskSource = 'Manual' | 'BidHandoff' | 'AI';

export interface Risk {
  readonly id: RiskId;
  readonly contractId: ContractId;
  readonly title: string;
  readonly description: string | null;
  readonly category: RiskCategory;
  readonly ownerUserId: UserId | null;
  readonly probability: RiskLikelihood;
  readonly impact: RiskLikelihood;
  readonly mitigation: string | null;
  readonly residualProbability: RiskLikelihood | null;
  readonly residualImpact: RiskLikelihood | null;
  readonly status: RiskStatus;
  readonly source: RiskSource;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
