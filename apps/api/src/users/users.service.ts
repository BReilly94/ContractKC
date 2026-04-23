import type { GlobalRole } from '@ckb/domain';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly globalRole: GlobalRole;
  readonly isPm: boolean;
  readonly canCreateContracts: boolean;
}

interface DbUserRow {
  id: string;
  email: string;
  display_name: string;
  global_role: GlobalRole;
  is_pm: boolean;
  can_create_contracts: boolean;
}

function mapRow(r: DbUserRow): UserRow {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    globalRole: r.global_role,
    isPm: r.is_pm,
    canCreateContracts: r.can_create_contracts,
  };
}

@Injectable()
export class UsersService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(filters: { isPm?: boolean } = {}): Promise<UserRow[]> {
    const req = this.pool.request();
    const where: string[] = [];
    if (filters.isPm !== undefined) {
      req.input('is_pm', mssql.Bit, filters.isPm ? 1 : 0);
      where.push('is_pm = @is_pm');
    }
    const r = await req.query<DbUserRow>(`
      SELECT id, email, display_name, global_role, is_pm, can_create_contracts
      FROM app_user
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY display_name ASC
    `);
    return r.recordset.map(mapRow);
  }
}
