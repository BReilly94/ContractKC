import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Interpretation / Decision log (SOW §3.13).
 *
 * Captures "on [date] the team determined X is in scope because of clause Y
 * and email Z". Becomes authoritative for the contract so the same debate
 * is not re-litigated when staff roll off.
 */

export type InterpretationId = BrandedId<'Interpretation'>;

export interface Interpretation {
  readonly id: InterpretationId;
  readonly contractId: ContractId;
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly decidedAt: string; // YYYY-MM-DD
  readonly decidedByUserId: UserId;
  readonly primaryClauseId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
