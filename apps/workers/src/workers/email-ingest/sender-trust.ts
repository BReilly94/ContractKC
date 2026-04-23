import {
  resolveSenderTrust,
  type SenderTrustEntry,
  type SenderTrustState,
} from '@ckb/domain';
import { asBrandedId } from '@ckb/shared';
import mssql from 'mssql';

/**
 * Wraps `resolveSenderTrust` with the DB lookup. The rule logic lives in
 * `@ckb/domain` so it's unit-testable without a DB.
 */
export async function checkSenderTrust(
  tx: mssql.Transaction,
  contractId: string,
  fromAddress: string,
): Promise<SenderTrustState> {
  const r = await new mssql.Request(tx)
    .input('contract_id', mssql.Char(26), contractId)
    .query<{
      id: string;
      contract_id: string | null;
      match_type: 'ExactAddress' | 'Domain';
      match_value: string;
      trust_state: 'Approved' | 'Denied';
      added_by_user_id: string;
      added_at: Date;
      reason: string | null;
    }>(`
      SELECT id, contract_id, match_type, match_value, trust_state,
             added_by_user_id, added_at, reason
        FROM sender_trust_entry
       WHERE contract_id = @contract_id OR contract_id IS NULL
    `);

  const entries: SenderTrustEntry[] = r.recordset.map((row) => ({
    id: asBrandedId<'SenderTrustEntry'>(row.id),
    contractId: row.contract_id ? asBrandedId<'Contract'>(row.contract_id) : null,
    matchType: row.match_type,
    matchValue: row.match_value,
    trustState: row.trust_state,
    addedByUserId: asBrandedId<'User'>(row.added_by_user_id),
    addedAt: row.added_at,
    reason: row.reason,
  }));

  return resolveSenderTrust(
    fromAddress,
    entries,
    asBrandedId<'Contract'>(contractId),
  );
}
