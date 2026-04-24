import {
  ErpManualFallbackRequiresPostError,
  type ErpClient,
  type ErpSnapshotFetchResult,
} from './interface.js';

/**
 * Manual-entry fallback client. It does not reach out to any external system —
 * snapshots are created by Contract Owner / Commercial Lead POST'ing to the
 * `POST /api/contracts/:id/erp-snapshot/manual` endpoint. Scheduled refreshes
 * that resolve to this client are a no-op (the scheduler logs "manual mode,
 * skip refresh").
 *
 * This exists so the rest of the stack — worker registration, service DI,
 * read paths — can operate identically whether or not a real ERP is wired in.
 */
export class ManualFallbackClient implements ErpClient {
  readonly sourceSystem = 'Manual' as const;

  async fetchContractSnapshot(): Promise<ErpSnapshotFetchResult> {
    throw new ErpManualFallbackRequiresPostError();
  }

  async ping(): Promise<boolean> {
    // The manual client always "works" — it has no upstream.
    return true;
  }
}
