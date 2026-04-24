/**
 * ERP read-only linkage (SOW §6.14 / §7.8).
 *
 * Phase 2 scope: approved contract value + approved variations. ERP is and
 * remains the system-of-record for commercial data. CKB only pulls the
 * subset needed to drive the Variation register and Claim Readiness Score
 * quantum component.
 *
 * Manual-entry fallback is the default (§6.14 item 4): the production ERP
 * client (SAP / Dynamics / Viewpoint / etc.) is pluggable; `ManualFallbackClient`
 * exists so operations can carry on before the real integration lands.
 */

export type ErpSourceSystem =
  | 'Manual'
  | 'SAP'
  | 'Dynamics'
  | 'Viewpoint'
  | 'JDE'
  | 'Other';

export interface ErpApprovedVariationRecord {
  readonly reference: string;
  readonly title: string;
  readonly approvedAmountCents: number;
  readonly approvedAt: string | null;
}

export interface ErpSnapshotFetchResult {
  readonly approvedContractValueCents: number | null;
  readonly approvedVariations: readonly ErpApprovedVariationRecord[];
  readonly sourceSystem: ErpSourceSystem;
  readonly currency: string | null;
  readonly notes: string | null;
  readonly takenAt: Date;
}

/**
 * The ERP client interface. Consumed by `ErpService` (API) and the ERP
 * refresh worker. Implementations live behind this contract; swapping the
 * real client for another vendor is a one-file change at the factory.
 */
export interface ErpClient {
  readonly sourceSystem: ErpSourceSystem;
  /**
   * Fetch the latest approved-contract-value + approved-variations snapshot
   * for a contract. May throw `ErpFetchError` on transport / auth failure;
   * callers surface the error and do not update the snapshot table.
   */
  fetchContractSnapshot(
    contractId: string,
    externalRef?: string,
  ): Promise<ErpSnapshotFetchResult>;
  /** Returns true if the client can reach its upstream. */
  ping(): Promise<boolean>;
}

export class ErpFetchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ErpFetchError';
  }
}

export class ErpManualFallbackRequiresPostError extends Error {
  constructor() {
    super(
      'Manual ERP fallback has no queryable snapshot. Post one via ' +
        '/api/contracts/:id/erp-snapshot/manual first.',
    );
    this.name = 'ErpManualFallbackRequiresPostError';
  }
}
