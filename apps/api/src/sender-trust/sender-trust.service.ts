import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import { ConflictError, newUlid, NotFoundError, ValidationError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface SenderTrustRow {
  readonly id: string;
  readonly contractId: string | null;
  readonly matchType: string;
  readonly matchValue: string;
  readonly trustState: string;
  readonly addedByUserId: string;
  readonly addedAt: Date;
  readonly reason: string | null;
}

interface DbRow {
  id: string;
  contract_id: string | null;
  match_type: string;
  match_value: string;
  trust_state: string;
  added_by_user_id: string;
  added_at: Date;
  reason: string | null;
}

function mapRow(r: DbRow): SenderTrustRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    matchType: r.match_type,
    matchValue: r.match_value,
    trustState: r.trust_state,
    addedByUserId: r.added_by_user_id,
    addedAt: r.added_at,
    reason: r.reason,
  };
}

@Injectable()
export class SenderTrustService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listForContract(contractId: string): Promise<SenderTrustRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`
        SELECT id, contract_id, match_type, match_value, trust_state,
               added_by_user_id, added_at, reason
          FROM sender_trust_entry
         WHERE contract_id = @contract_id OR contract_id IS NULL
         ORDER BY contract_id ASC, match_type, match_value
      `);
    return r.recordset.map(mapRow);
  }

  async listGlobal(): Promise<SenderTrustRow[]> {
    const r = await this.pool.request().query<DbRow>(`
      SELECT id, contract_id, match_type, match_value, trust_state,
             added_by_user_id, added_at, reason
        FROM sender_trust_entry
       WHERE contract_id IS NULL
       ORDER BY match_type, match_value
    `);
    return r.recordset.map(mapRow);
  }

  async add(
    principal: Principal,
    params: {
      contractId: string | null;
      matchType: 'ExactAddress' | 'Domain';
      matchValue: string;
      trustState: 'Approved' | 'Denied';
      reason: string | null;
    },
    correlationId: string,
  ): Promise<SenderTrustRow> {
    if (params.matchType === 'ExactAddress' && !params.matchValue.includes('@')) {
      throw new ValidationError('ExactAddress entries must include "@"');
    }
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), params.contractId)
        .input('match_type', mssql.VarChar(16), params.matchType)
        .input('match_value', mssql.NVarChar(320), params.matchValue.toLowerCase())
        .input('trust_state', mssql.VarChar(16), params.trustState)
        .input('added_by_user_id', mssql.Char(26), principal.userId)
        .input('reason', mssql.NVarChar(1024), params.reason)
        .query(`
          INSERT INTO sender_trust_entry
            (id, contract_id, match_type, match_value, trust_state, added_by_user_id, reason)
          VALUES
            (@id, @contract_id, @match_type, @match_value, @trust_state, @added_by_user_id, @reason);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'email.sender_trust.change',
        entityType: 'SenderTrustEntry',
        entityId: id,
        after: { ...params, matchValue: params.matchValue.toLowerCase() },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      if (err instanceof mssql.RequestError && err.number === 2627) {
        throw new ConflictError('Duplicate sender trust entry');
      }
      throw err;
    }

    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`
        SELECT id, contract_id, match_type, match_value, trust_state,
               added_by_user_id, added_at, reason
          FROM sender_trust_entry WHERE id = @id
      `);
    const row = r.recordset[0];
    if (!row) throw new Error('Sender trust entry disappeared after insert');
    return mapRow(row);
  }

  async remove(principal: Principal, id: string, correlationId: string): Promise<void> {
    const existing = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(
        `SELECT id, contract_id, match_type, match_value, trust_state, added_by_user_id, added_at, reason FROM sender_trust_entry WHERE id = @id`,
      );
    if (existing.recordset.length === 0) {
      throw new NotFoundError('Sender trust entry not found');
    }
    const before = existing.recordset[0]!;
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .query(`DELETE FROM sender_trust_entry WHERE id = @id;`);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'email.sender_trust.change',
        entityType: 'SenderTrustEntry',
        entityId: id,
        before: {
          contractId: before.contract_id,
          matchType: before.match_type,
          matchValue: before.match_value,
          trustState: before.trust_state,
        },
        after: { removed: true },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}
