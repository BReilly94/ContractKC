import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Policy register (SOW §3.16): unified store for insurance policies, bonds,
 * and permits. All carry an expiry date and a renewal-responsibility party;
 * pre-expiry alerts feed the Deadline Tracker via an auto-linked Deadline.
 */

export type PolicyId = BrandedId<'Policy'>;

export type PolicyKind = 'Insurance' | 'Bond' | 'Permit';

export type PolicyRenewalResponsibility =
  | 'Contractor'
  | 'Client'
  | 'Consultant'
  | 'Subcontractor'
  | 'Other';

export interface Policy {
  readonly id: PolicyId;
  readonly contractId: ContractId;
  readonly kind: PolicyKind;
  readonly typeDetail: string | null;
  readonly policyNumber: string | null;
  readonly issuer: string | null;
  readonly coverageAmountCents: number | null;
  readonly namedInsureds: string | null;
  readonly effectiveDate: string | null;
  readonly expiryDate: string | null;
  readonly renewalResponsibility: PolicyRenewalResponsibility | null;
  readonly preExpiryAlertDays: number;
  readonly notes: string | null;
  readonly deadlineId: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
