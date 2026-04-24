import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type { ContractRole, RevocationReason } from '@ckb/domain';
import { ConflictError, newUlid, NotFoundError, ValidationError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface RevocationRow {
  readonly id: string;
  readonly contractId: string;
  readonly userId: string;
  readonly revokedByUserId: string;
  readonly revokedAt: Date;
  readonly reasonCategory: RevocationReason;
  readonly reasonNote: string | null;
  readonly reversedAt: Date | null;
  readonly reversedByUserId: string | null;
  readonly reversalReason: string | null;
  readonly notifySubject: boolean;
}

interface RevocationDbRow {
  id: string;
  contract_id: string;
  user_id: string;
  revoked_by_user_id: string;
  revoked_at: Date;
  reason_category: RevocationReason;
  reason_note: string | null;
  reversed_at: Date | null;
  reversed_by_user_id: string | null;
  reversal_reason: string | null;
  notify_subject: boolean;
}

function mapRevocation(r: RevocationDbRow): RevocationRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    userId: r.user_id,
    revokedByUserId: r.revoked_by_user_id,
    revokedAt: r.revoked_at,
    reasonCategory: r.reason_category,
    reasonNote: r.reason_note,
    reversedAt: r.reversed_at,
    reversedByUserId: r.reversed_by_user_id,
    reversalReason: r.reversal_reason,
    notifySubject: Boolean(r.notify_subject),
  };
}

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

  /**
   * §9.6 — Individual access revocation. Overrides role-based grants.
   */
  async revoke(
    principal: Principal,
    contractId: string,
    userId: string,
    input: {
      reasonCategory: RevocationReason;
      reasonNote: string | null;
      notifySubject: boolean;
    },
    correlationId: string,
  ): Promise<{ id: string }> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const existing = await new mssql.Request(tx)
        .input('contract_id', mssql.Char(26), contractId)
        .input('user_id', mssql.Char(26), userId)
        .query<{ id: string }>(`
          SELECT id FROM contract_access_revocation
           WHERE contract_id = @contract_id AND user_id = @user_id AND reversed_at IS NULL
        `);
      if (existing.recordset.length > 0) {
        throw new ConflictError('Active revocation already exists for this user on this contract');
      }

      const id = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('user_id', mssql.Char(26), userId)
        .input('revoked_by_user_id', mssql.Char(26), principal.userId)
        .input('reason_category', mssql.VarChar(40), input.reasonCategory)
        .input('reason_note', mssql.NVarChar(2000), input.reasonNote)
        .input('notify_subject', mssql.Bit, input.notifySubject)
        .query(`
          INSERT INTO contract_access_revocation
            (id, contract_id, user_id, revoked_by_user_id, reason_category, reason_note, notify_subject)
          VALUES (@id, @contract_id, @user_id, @revoked_by_user_id, @reason_category, @reason_note, @notify_subject);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contract_access.revoke',
        entityType: 'ContractAccessRevocation',
        entityId: id,
        after: {
          contractId,
          userId,
          reasonCategory: input.reasonCategory,
          reasonNote: input.reasonNote,
          notifySubject: input.notifySubject,
        },
        correlationId,
      });
      await tx.commit();
      return { id };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async reverseRevocation(
    principal: Principal,
    contractId: string,
    revocationId: string,
    reversalReason: string,
    correlationId: string,
  ): Promise<void> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const current = await new mssql.Request(tx)
        .input('id', mssql.Char(26), revocationId)
        .input('contract_id', mssql.Char(26), contractId)
        .query<{ reversed_at: Date | null }>(`
          SELECT reversed_at FROM contract_access_revocation
           WHERE id = @id AND contract_id = @contract_id
        `);
      if (current.recordset.length === 0) {
        throw new NotFoundError('Revocation not found');
      }
      if (current.recordset[0]!.reversed_at !== null) {
        throw new ConflictError('Revocation already reversed');
      }
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), revocationId)
        .input('reversed_by_user_id', mssql.Char(26), principal.userId)
        .input('reversal_reason', mssql.NVarChar(1024), reversalReason)
        .query(`
          UPDATE contract_access_revocation
             SET reversed_at = SYSDATETIMEOFFSET(),
                 reversed_by_user_id = @reversed_by_user_id,
                 reversal_reason = @reversal_reason
           WHERE id = @id;
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contract_access.revocation.reverse',
        entityType: 'ContractAccessRevocation',
        entityId: revocationId,
        after: { reversalReason },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async listRevocations(contractId: string): Promise<RevocationRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<RevocationDbRow>(`
        SELECT id, contract_id, user_id, revoked_by_user_id, revoked_at,
               reason_category, reason_note, reversed_at, reversed_by_user_id,
               reversal_reason, notify_subject
          FROM contract_access_revocation
         WHERE contract_id = @contract_id
         ORDER BY revoked_at DESC
      `);
    return r.recordset.map(mapRevocation);
  }
}
