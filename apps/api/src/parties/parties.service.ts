import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import { newUlid } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface PartyRow {
  readonly id: string;
  readonly name: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

interface DbPartyRow {
  id: string;
  name: string;
  created_by_user_id: string;
  created_at: Date;
}

function mapRow(r: DbPartyRow): PartyRow {
  return {
    id: r.id,
    name: r.name,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
  };
}

@Injectable()
export class PartiesService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(search?: string): Promise<PartyRow[]> {
    const req = this.pool.request();
    let where = '';
    if (search && search.trim().length > 0) {
      req.input('q', mssql.NVarChar(256), `%${search.trim()}%`);
      where = 'WHERE name LIKE @q';
    }
    const r = await req.query<DbPartyRow>(`
      SELECT id, name, created_by_user_id, created_at
      FROM party
      ${where}
      ORDER BY name ASC
    `);
    return r.recordset.map(mapRow);
  }

  async create(
    principal: Principal,
    name: string,
    correlationId: string,
  ): Promise<PartyRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('name', mssql.NVarChar(256), name)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO party (id, name, created_by_user_id)
          VALUES (@id, @name, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'party.create',
        entityType: 'Party',
        entityId: id,
        after: { id, name },
        correlationId,
      });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    const fetched = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbPartyRow>(
        'SELECT id, name, created_by_user_id, created_at FROM party WHERE id = @id',
      );
    return mapRow(fetched.recordset[0]!);
  }
}
