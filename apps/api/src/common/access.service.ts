import { NotFoundError } from '@ckb/shared';
import type { ContractRole } from '@ckb/domain';
import type { Principal } from '@ckb/auth';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from './tokens.js';

/**
 * Centralized contract-access check (security.md §2, §3). Used by routes that
 * don't have the contract id in their path, so the ContractAccessGuard can't
 * fire. Applies the revocation → grant → default-deny order.
 */
@Injectable()
export class ContractAccessService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async resolveRole(
    principal: Principal,
    contractId: string,
  ): Promise<ContractRole | null> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .input('user_id', mssql.Char(26), principal.userId)
      .query<{ revocation_id: string | null; contract_role: ContractRole | null }>(`
        SELECT
          (SELECT TOP 1 id FROM contract_access_revocation
           WHERE contract_id = @contract_id AND user_id = @user_id AND reversed_at IS NULL) AS revocation_id,
          (SELECT TOP 1 contract_role FROM contract_access
           WHERE contract_id = @contract_id AND user_id = @user_id) AS contract_role
      `);
    const row = r.recordset[0];
    if (!row || row.revocation_id || !row.contract_role) return null;
    return row.contract_role;
  }

  async assertAccess(principal: Principal, contractId: string): Promise<ContractRole> {
    const role = await this.resolveRole(principal, contractId);
    if (!role) {
      // Leak-avoiding 404, not 403 — the user should not be able to tell
      // whether the resource exists but is inaccessible vs. doesn't exist.
      throw new NotFoundError('Not found');
    }
    return role;
  }
}
