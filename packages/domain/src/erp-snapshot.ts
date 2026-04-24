import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * ERP read-only linkage (SOW §3.18/§6.14 Phase 2, §7.8).
 *
 * Phase 2 scope is limited to approved contract value and approved variations
 * — enough to drive the Variation register and the quantum component of
 * Claim Readiness Score. ERP remains system-of-record for cost; CKB only
 * snapshots what it needs. Committed / certified / paid amounts are Phase 3.
 *
 * Manual-entry fallback is the default (SOW §6.14 item 4): the real ERP
 * client is pluggable behind `ErpClient`, with `ManualFallbackClient`
 * reading whatever the Contract Owner or Commercial Lead posts at
 * `POST /api/contracts/:id/erp-snapshot/manual`.
 */

export type ErpSnapshotId = BrandedId<'ErpSnapshot'>;

export type ErpSourceSystem = 'Manual' | 'SAP' | 'Dynamics' | 'Viewpoint' | 'JDE' | 'Other';

export interface ErpApprovedVariation {
  readonly reference: string;
  readonly title: string;
  readonly approvedAmountCents: number;
  readonly approvedAt: string | null;
}

export interface ErpSnapshot {
  readonly id: ErpSnapshotId;
  readonly contractId: ContractId;
  readonly takenAt: Date;
  readonly approvedContractValueCents: number | null;
  readonly approvedVariations: readonly ErpApprovedVariation[];
  readonly sourceSystem: ErpSourceSystem;
  readonly lastRefreshedByUserId: UserId | null;
  readonly lastRefreshedBySystem: string | null;
  readonly currency: string | null;
  readonly notes: string | null;
}
