import mssql from 'mssql';

/**
 * Recipient → contract resolution. Walks envelope recipients + Delivered-To,
 * matches against `email_alias.local_part` (case-insensitive) with
 * `active = 1`. Returns all matching contract ids (multiple only when one
 * email is addressed to multiple contracts — each gets its own email row).
 */

export interface AliasMatch {
  readonly contractId: string;
  readonly localPart: string;
}

export async function resolveRecipientsToContracts(
  pool: mssql.ConnectionPool,
  recipients: readonly string[],
): Promise<AliasMatch[]> {
  if (recipients.length === 0) return [];
  const localParts = new Set<string>();
  for (const r of recipients) {
    const at = r.indexOf('@');
    if (at < 0) continue;
    localParts.add(r.slice(0, at).toLowerCase());
  }
  if (localParts.size === 0) return [];
  const values = [...localParts];
  // Build a parameterized IN clause safely.
  const req = pool.request();
  const placeholders = values
    .map((lp, i) => {
      req.input(`lp${i}`, mssql.VarChar(64), lp);
      return `@lp${i}`;
    })
    .join(', ');
  const r = await req.query<{ contract_id: string; local_part: string }>(
    `SELECT contract_id, local_part
       FROM email_alias
      WHERE active = 1 AND local_part IN (${placeholders})`,
  );
  return r.recordset.map((row) => ({ contractId: row.contract_id, localPart: row.local_part }));
}
