import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Variation / change order lifecycle (SOW §3.11, §6.22).
 *
 *   Proposed → Priced → Submitted → Approved | Rejected | Disputed → Closed
 *
 * Disputed may flow back to Approved or Rejected if the dispute resolves in
 * place. A Disputed variation that escalates into a Claim closes via
 * Disputed → Closed; the claim linkage is an association record, not a state.
 */

export type VariationLifecycleState =
  | 'Proposed'
  | 'Priced'
  | 'Submitted'
  | 'Approved'
  | 'Rejected'
  | 'Disputed'
  | 'Closed';

export interface VariationLifecycleTransition {
  readonly from: VariationLifecycleState;
  readonly to: VariationLifecycleState;
}

export const LEGAL_VARIATION_TRANSITIONS: readonly VariationLifecycleTransition[] = [
  { from: 'Proposed', to: 'Priced' },
  { from: 'Proposed', to: 'Closed' },
  { from: 'Priced', to: 'Submitted' },
  { from: 'Priced', to: 'Closed' },
  { from: 'Submitted', to: 'Approved' },
  { from: 'Submitted', to: 'Rejected' },
  { from: 'Submitted', to: 'Disputed' },
  { from: 'Approved', to: 'Closed' },
  { from: 'Rejected', to: 'Closed' },
  { from: 'Disputed', to: 'Approved' },
  { from: 'Disputed', to: 'Rejected' },
  { from: 'Disputed', to: 'Closed' },
];

export function isLegalVariationTransition(
  from: VariationLifecycleState,
  to: VariationLifecycleState,
): boolean {
  return LEGAL_VARIATION_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export type VariationId = BrandedId<'Variation'>;

export interface Variation {
  readonly id: VariationId;
  readonly contractId: ContractId;
  readonly variationNumber: number | null;
  readonly title: string;
  readonly lifecycleState: VariationLifecycleState;
  readonly submittedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
