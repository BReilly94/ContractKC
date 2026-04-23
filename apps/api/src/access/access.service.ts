import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type { ContractRole } from '@ckb/domain';
import { ConflictError, newUlid, NotFoundError, ValidationError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

@Injectable()
export class AccessService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async grant(
    principal: Principal,
    contractId: string,
    userId: string,
    role: ContractRole,
    correlationId: string,
  ): Promise<{ id: string }> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const contractExists = await new mssql.Request(tx)
        .input('id', mssql.Char(26), contractId)
        .query('SELECT TOP 1 id FROM contract WHERE id = @id');
      if (contractExists.recordset.length === 0) {
        throw new NotFoundError('Contract not found');
      }
      const userExists = await new mssql.Request(tx)
        .input('id', mssql.Char(26), userId)
        .query('SELECT TOP 1 id FROM app_user WHERE id = @id');
      if (userExists.recordset.length === 0) {
        throw new ValidationError(`User ${userId} not found`);
      }

      const id = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('user_id', mssql.Char(26), userId)
        .input('contract_role', mssql.VarChar(32), role)
        .input('granted_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO contract_access (id, contract_id, user_id, contract_role, granted_by_user_id)
          VALUES (@id, @contract_id, @user_id, @contract_role, @granted_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contract_access.grant',
        entityType: 'ContractAccess',
        entityId: id,
        after: { contractId, userId, role },
        correlationId,
      });
      await tx.commit();
      return { id };
    } catch (err) {
      await tx.rollback();
      if (err instanceof mssql.RequestError && err.number === 2627) {
        throw new ConflictError('User already has a grant on this contract');
      }
      throw err;
    }
  }
}
