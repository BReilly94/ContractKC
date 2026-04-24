import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Payment application tracking (SOW §3.15). Progress claims submitted,
 * certified amounts, paid amounts, disputed items. Statutory payment
 * timelines feed the Deadline Tracker via the standard verification gate.
 */

export type PaymentApplicationId = BrandedId<'PaymentApplication'>;

export type PaymentApplicationStatus =
  | 'Draft'
  | 'Submitted'
  | 'Certified'
  | 'Paid'
  | 'Disputed'
  | 'Closed';

export const LEGAL_PAYMENT_APPLICATION_TRANSITIONS: ReadonlyArray<{
  from: PaymentApplicationStatus;
  to: PaymentApplicationStatus;
}> = [
  { from: 'Draft', to: 'Submitted' },
  { from: 'Draft', to: 'Closed' },
  { from: 'Submitted', to: 'Certified' },
  { from: 'Submitted', to: 'Disputed' },
  { from: 'Certified', to: 'Paid' },
  { from: 'Certified', to: 'Disputed' },
  { from: 'Paid', to: 'Closed' },
  { from: 'Disputed', to: 'Certified' },
  { from: 'Disputed', to: 'Closed' },
];

export function isLegalPaymentApplicationTransition(
  from: PaymentApplicationStatus,
  to: PaymentApplicationStatus,
): boolean {
  return LEGAL_PAYMENT_APPLICATION_TRANSITIONS.some(
    (t) => t.from === from && t.to === to,
  );
}

export interface PaymentApplication {
  readonly id: PaymentApplicationId;
  readonly contractId: ContractId;
  readonly applicationNumber: number | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly claimedAmountCents: number | null;
  readonly certifiedAmountCents: number | null;
  readonly paidAmountCents: number | null;
  readonly disputedAmountCents: number | null;
  readonly status: PaymentApplicationStatus;
  readonly submittedAt: Date | null;
  readonly certificationDueAt: Date | null;
  readonly certifiedAt: Date | null;
  readonly paymentDueAt: Date | null;
  readonly paidAt: Date | null;
  readonly notes: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
