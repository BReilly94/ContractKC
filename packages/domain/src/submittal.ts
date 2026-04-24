import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Submittal / Transmittal lifecycle (SOW §3.11b, §6.22).
 *
 *   Draft → Submitted → UnderReview
 *         → Approved | ApprovedAsNoted | ReviseAndResubmit | Rejected
 *         → Closed
 *
 * ReviseAndResubmit closes the current submittal; the revised version is a
 * new submittal record that points back via previousSubmittalId to preserve
 * the chain across resubmissions.
 */

export type SubmittalLifecycleState =
  | 'Draft'
  | 'Submitted'
  | 'UnderReview'
  | 'Approved'
  | 'ApprovedAsNoted'
  | 'ReviseAndResubmit'
  | 'Rejected'
  | 'Closed';

export interface SubmittalLifecycleTransition {
  readonly from: SubmittalLifecycleState;
  readonly to: SubmittalLifecycleState;
}

export const LEGAL_SUBMITTAL_TRANSITIONS: readonly SubmittalLifecycleTransition[] = [
  { from: 'Draft', to: 'Submitted' },
  { from: 'Draft', to: 'Closed' },
  { from: 'Submitted', to: 'UnderReview' },
  { from: 'Submitted', to: 'Closed' },
  { from: 'UnderReview', to: 'Approved' },
  { from: 'UnderReview', to: 'ApprovedAsNoted' },
  { from: 'UnderReview', to: 'ReviseAndResubmit' },
  { from: 'UnderReview', to: 'Rejected' },
  { from: 'Approved', to: 'Closed' },
  { from: 'ApprovedAsNoted', to: 'Closed' },
  { from: 'ReviseAndResubmit', to: 'Closed' },
  { from: 'Rejected', to: 'Closed' },
];

export function isLegalSubmittalTransition(
  from: SubmittalLifecycleState,
  to: SubmittalLifecycleState,
): boolean {
  return LEGAL_SUBMITTAL_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export type SubmittalId = BrandedId<'Submittal'>;

export interface Submittal {
  readonly id: SubmittalId;
  readonly contractId: ContractId;
  readonly submittalNumber: number | null;
  readonly title: string;
  readonly previousSubmittalId: SubmittalId | null;
  readonly lifecycleState: SubmittalLifecycleState;
  readonly submittedAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
