import type { ContractRole } from '@ckb/domain';
import mssql from 'mssql';

/**
 * Shared helpers for Phase 2 register services. Register CRUD follows a
 * repeated shape — the helpers here keep each service focused on its own
 * fields rather than on boilerplate.
 */

export const REGISTER_WRITE_ROLES: readonly ContractRole[] = [
  'Owner',
  'Administrator',
  'Contributor',
];

export const REGISTER_READ_ROLES: readonly ContractRole[] = [
  'Owner',
  'Administrator',
  'Contributor',
  'Viewer',
];

export async function assertContractExists(
  pool: mssql.ConnectionPool | mssql.Transaction,
  contractId: string,
): Promise<void> {
  const req = pool instanceof mssql.Transaction ? new mssql.Request(pool) : pool.request();
  const r = await req
    .input('id', mssql.Char(26), contractId)
    .query<{ id: string }>('SELECT TOP 1 id FROM contract WHERE id = @id');
  if (r.recordset.length === 0) {
    const err = new Error('Contract not found');
    (err as { status?: number }).status = 404;
    throw err;
  }
}

/**
 * Atomically assign the next per-contract sequence number for an entity
 * whose table has `(contract_id, <column>)` UNIQUE. Callers run inside
 * their own transaction; this helper just returns the next integer.
 */
export async function nextContractSequence(
  tx: mssql.Transaction,
  table: string,
  column: string,
  contractId: string,
): Promise<number> {
  const safeTable = table.replace(/[^a-zA-Z_]/g, '');
  const safeColumn = column.replace(/[^a-zA-Z_]/g, '');
  const r = await new mssql.Request(tx)
    .input('contract_id', mssql.Char(26), contractId)
    .query<{ next: number | null }>(
      `SELECT ISNULL(MAX(${safeColumn}), 0) + 1 AS next
         FROM ${safeTable} WITH (UPDLOCK, HOLDLOCK)
        WHERE contract_id = @contract_id`,
    );
  return r.recordset[0]?.next ?? 1;
}
