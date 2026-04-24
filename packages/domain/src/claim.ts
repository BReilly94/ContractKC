import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Claim lifecycle (SOW §3.34, §6.22).
 *
 *   Draft → InternalReview → Submitted → ClientResponseReceived
 *         → UnderNegotiation → Resolved{Won,Settled,Lost,Withdrawn}
 *
 * Terminal states are split by resolution outcome so the FSM itself carries
 * the answer to "how did this claim end?" — matching the Deadline precedent
 * of Complete vs Missed as distinct states.
 */

export type ClaimLifecycleState =
  | 'Draft'
  | 'InternalReview'
  | 'Submitted'
  | 'ClientResponseReceived'
  | 'UnderNegotiation'
  | 'ResolvedWon'
  | 'ResolvedSettled'
  | 'ResolvedLost'
  | 'ResolvedWithdrawn';

export const CLAIM_RESOLVED_STATES: ReadonlyArray<ClaimLifecycleState> = [
  'ResolvedWon',
  'ResolvedSettled',
  'ResolvedLost',
  'ResolvedWithdrawn',
];

export function isClaimResolved(state: ClaimLifecycleState): boolean {
  return CLAIM_RESOLVED_STATES.includes(state);
}

export interface ClaimLifecycleTransition {
  readonly from: ClaimLifecycleState;
  readonly to: ClaimLifecycleState;
}

export const LEGAL_CLAIM_TRANSITIONS: readonly ClaimLifecycleTransition[] = [
  { from: 'Draft', to: 'InternalReview' },
  { from: 'Draft', to: 'ResolvedWithdrawn' },
  { from: 'InternalReview', to: 'Draft' },
  { from: 'InternalReview', to: 'Submitted' },
  { from: 'InternalReview', to: 'ResolvedWithdrawn' },
  { from: 'Submitted', to: 'ClientResponseReceived' },
  { from: 'Submitted', to: 'ResolvedWithdrawn' },
  { from: 'ClientResponseReceived', to: 'UnderNegotiation' },
  { from: 'ClientResponseReceived', to: 'ResolvedWon' },
  { from: 'ClientResponseReceived', to: 'ResolvedSettled' },
  { from: 'ClientResponseReceived', to: 'ResolvedLost' },
  { from: 'ClientResponseReceived', to: 'ResolvedWithdrawn' },
  { from: 'UnderNegotiation', to: 'ResolvedWon' },
  { from: 'UnderNegotiation', to: 'ResolvedSettled' },
  { from: 'UnderNegotiation', to: 'ResolvedLost' },
  { from: 'UnderNegotiation', to: 'ResolvedWithdrawn' },
];

export function isLegalClaimTransition(
  from: ClaimLifecycleState,
  to: ClaimLifecycleState,
): boolean {
  return LEGAL_CLAIM_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export type ClaimId = BrandedId<'Claim'>;

export interface Claim {
  readonly id: ClaimId;
  readonly contractId: ContractId;
  readonly claimNumber: number | null;
  readonly title: string;
  readonly lifecycleState: ClaimLifecycleState;
  readonly submittedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly resolutionNote: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
