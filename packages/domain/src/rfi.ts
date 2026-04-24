import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * RFI lifecycle (SOW §6.22).
 *
 *   Draft → Issued → AwaitingResponse → ResponseReceived → Closed
 *
 * ResponseReceived → AwaitingResponse supports follow-up exchanges on the
 * same RFI before it is closed out.
 */

export type RfiLifecycleState =
  | 'Draft'
  | 'Issued'
  | 'AwaitingResponse'
  | 'ResponseReceived'
  | 'Closed';

export interface RfiLifecycleTransition {
  readonly from: RfiLifecycleState;
  readonly to: RfiLifecycleState;
}

export const LEGAL_RFI_TRANSITIONS: readonly RfiLifecycleTransition[] = [
  { from: 'Draft', to: 'Issued' },
  { from: 'Draft', to: 'Closed' },
  { from: 'Issued', to: 'AwaitingResponse' },
  { from: 'Issued', to: 'Closed' },
  { from: 'AwaitingResponse', to: 'ResponseReceived' },
  { from: 'AwaitingResponse', to: 'Closed' },
  { from: 'ResponseReceived', to: 'AwaitingResponse' },
  { from: 'ResponseReceived', to: 'Closed' },
];

export function isLegalRfiTransition(
  from: RfiLifecycleState,
  to: RfiLifecycleState,
): boolean {
  return LEGAL_RFI_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export type RfiId = BrandedId<'Rfi'>;

export interface Rfi {
  readonly id: RfiId;
  readonly contractId: ContractId;
  readonly rfiNumber: number | null;
  readonly subject: string;
  readonly lifecycleState: RfiLifecycleState;
  readonly issuedAt: Date | null;
  readonly responseReceivedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
