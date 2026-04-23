import type { CurrencyCode } from '@ckb/shared';
import type { ContractId, ContractSummaryId, PartyId, UserId } from './ids.js';

export type ContractLifecycleState =
  | 'Draft'
  | 'Onboarding'
  | 'Active'
  | 'IssueInProgress'
  | 'Closeout'
  | 'Archived';

export type ConfidentialityClass = 'Standard' | 'Restricted' | 'HighlyRestricted';

export type VerificationState = 'Unverified' | 'Verified' | 'Superseded';

export interface Contract {
  readonly id: ContractId;
  readonly name: string;
  readonly clientPartyId: PartyId;
  readonly responsiblePmUserId: UserId;
  readonly contractValueCents: number | null;
  readonly currency: CurrencyCode;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly governingLaw: string;
  readonly confidentialityClass: ConfidentialityClass;
  readonly language: string;
  readonly lifecycleState: ContractLifecycleState;
  readonly vectorNamespace: string;
  readonly projectEmailAddress: string;
  readonly projectEmailAlias: string | null;
  readonly summaryId: ContractSummaryId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ContractSummary {
  readonly id: ContractSummaryId;
  readonly contractId: ContractId;
  readonly verificationState: VerificationState;
  readonly contentJson: Record<string, unknown> | null;
  readonly verifiedByUserId: UserId | null;
  readonly verifiedAt: Date | null;
  readonly generatedByCapabilityVersion: string | null;
  readonly generatedAt: Date | null;
}

export interface LifecycleTransition {
  readonly from: ContractLifecycleState;
  readonly to: ContractLifecycleState;
}

export const LEGAL_LIFECYCLE_TRANSITIONS: readonly LifecycleTransition[] = [
  { from: 'Draft', to: 'Onboarding' },
  { from: 'Onboarding', to: 'Active' },
  { from: 'Active', to: 'IssueInProgress' },
  { from: 'IssueInProgress', to: 'Active' },
  { from: 'Active', to: 'Closeout' },
  { from: 'IssueInProgress', to: 'Closeout' },
  { from: 'Closeout', to: 'Archived' },
];

export function isLegalTransition(
  from: ContractLifecycleState,
  to: ContractLifecycleState,
): boolean {
  return LEGAL_LIFECYCLE_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export type TransitionGateFailure =
  | { code: 'IllegalTransition'; from: ContractLifecycleState; to: ContractLifecycleState }
  | { code: 'SummaryUnverified'; from: ContractLifecycleState; to: ContractLifecycleState };

export function evaluateTransitionGate(params: {
  from: ContractLifecycleState;
  to: ContractLifecycleState;
  summaryVerificationState: VerificationState;
}): TransitionGateFailure | null {
  if (!isLegalTransition(params.from, params.to)) {
    return { code: 'IllegalTransition', from: params.from, to: params.to };
  }
  if (params.from === 'Onboarding' && params.to === 'Active') {
    if (params.summaryVerificationState !== 'Verified') {
      return { code: 'SummaryUnverified', from: params.from, to: params.to };
    }
  }
  return null;
}
