import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import { newUlid, NotFoundError, utcNow } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

/**
 * Per-contract contacts (§5.7).
 *
 * Authority levels are visible at point of decision — the email viewer
 * looks up the sender via `email` to find any contact with a matching
 * `email` for the contract and surfaces the authority badge.
 */

export type AuthorityLevel =
  | 'CanDirectExtraWork'
  | 'CanIssueSiteInstructions'
  | 'CanApproveVariations'
  | 'Administrative';

export interface ContactRow {
  readonly id: string;
  readonly contractId: string;
  readonly partyId: string | null;
  readonly name: string;
  readonly roleTitle: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly authorityLevel: AuthorityLevel;
  readonly notes: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  party_id: string | null;
  name: string;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  authority_level: AuthorityLevel;
  notes: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: DbRow): ContactRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    partyId: r.party_id,
    name: r.name,
    roleTitle: r.role_title,
    email: r.email,
    phone: r.phone,
    authorityLevel: r.authority_level,
    notes: r.notes,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, party_id, name, role_title, email, phone,
         authority_level, notes, created_by_user_id, created_at, updated_at
    FROM contract_contact
`;

export interface ContactCreateInput {
  readonly partyId: string | null;
  readonly name: string;
  readonly roleTitle: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly authorityLevel: AuthorityLevel;
  readonly notes: string | null;
}

@Injectable()
export class ContactsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listForContract(contractId: string): Promise<ContactRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY name ASC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<ContactRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    const row = r.recordset[0];
    return row ? mapRow(row) : null;
  }

  async lookupByEmail(contractId: string, email: string): Promise<ContactRow | null> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .input('email', mssql.NVarChar(320), email.toLowerCase())
      .query<DbRow>(
        `${SELECT} WHERE contract_id = @contract_id AND LOWER(email) = @email`,
      );
    const row = r.recordset[0];
    return row ? mapRow(row) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: ContactCreateInput,
    correlationId: string,
  ): Promise<ContactRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('party_id', mssql.Char(26), input.partyId)
        .input('name', mssql.NVarChar(256), input.name)
        .input('role_title', mssql.NVarChar(256), input.roleTitle)
        .input('email', mssql.NVarChar(320), input.email)
        .input('phone', mssql.NVarChar(64), input.phone)
        .input('authority_level', mssql.VarChar(40), input.authorityLevel)
        .input('notes', mssql.NVarChar(2000), input.notes)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO contract_contact
            (id, contract_id, party_id, name, role_title, email, phone,
             authority_level, notes, created_by_user_id)
          VALUES
            (@id, @contract_id, @party_id, @name, @role_title, @email, @phone,
             @authority_level, @notes, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contact.create',
        entityType: 'ContractContact',
        entityId: id,
        after: {
          contractId,
          name: input.name,
          email: input.email,
          authorityLevel: input.authorityLevel,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const created = await this.get(id);
    if (!created) throw new Error('Contact disappeared after create');
    return created;
  }

  async update(
    principal: Principal,
    id: string,
    input: {
      partyId?: string | null | undefined;
      name?: string | undefined;
      roleTitle?: string | null | undefined;
      email?: string | null | undefined;
      phone?: string | null | undefined;
      authorityLevel?: AuthorityLevel | undefined;
      notes?: string | null | undefined;
    },
    correlationId: string,
  ): Promise<ContactRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Contact not found');
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('party_id', mssql.Char(26), input.partyId ?? current.partyId)
        .input('name', mssql.NVarChar(256), input.name ?? current.name)
        .input('role_title', mssql.NVarChar(256), input.roleTitle ?? current.roleTitle)
        .input('email', mssql.NVarChar(320), input.email ?? current.email)
        .input('phone', mssql.NVarChar(64), input.phone ?? current.phone)
        .input(
          'authority_level',
          mssql.VarChar(40),
          input.authorityLevel ?? current.authorityLevel,
        )
        .input('notes', mssql.NVarChar(2000), input.notes ?? current.notes)
        .input('now', mssql.DateTimeOffset, utcNow())
        .query(`
          UPDATE contract_contact
             SET party_id = @party_id,
                 name = @name,
                 role_title = @role_title,
                 email = @email,
                 phone = @phone,
                 authority_level = @authority_level,
                 notes = @notes,
                 updated_at = @now
           WHERE id = @id;
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contact.update',
        entityType: 'ContractContact',
        entityId: id,
        before: { ...current } as unknown as Record<string, unknown>,
        after: { ...current, ...input } as unknown as Record<string, unknown>,
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Contact disappeared after update');
    return updated;
  }

  async delete(principal: Principal, id: string, correlationId: string): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Contact not found');
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .query(`DELETE FROM contract_contact WHERE id = @id;`);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contact.delete',
        entityType: 'ContractContact',
        entityId: id,
        before: { ...current } as unknown as Record<string, unknown>,
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}
