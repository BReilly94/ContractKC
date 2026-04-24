import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  isLegalVariationTransition,
  type VariationLifecycleState,
} from '@ckb/domain';
import {
  ConflictError,
  newUlid,
  NotFoundError,
  utcNow,
  ValidationError,
} from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';
import { nextContractSequence } from '../common/register-helpers.js';

export interface VariationRow {
  readonly id: string;
  readonly contractId: string;
  readonly variationNumber: number | null;
  readonly title: string;
  readonly description: string | null;
  readonly lifecycleState: VariationLifecycleState;
  readonly pricedAmountCents: number | null;
  readonly approvedAmountCents: number | null;
  readonly originatingInstruction: string | null;
  readonly submittedAt: Date | null;
  readonly disputedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  variation_number: number | null;
  title: string;
  description: string | null;
  lifecycle_state: VariationLifecycleState;
  priced_amount_cents: number | string | null;
  approved_amount_cents: number | string | null;
  originating_instruction: string | null;
  submitted_at: Date | null;
  disputed_at: Date | null;
  closed_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function asNumber(v: number | string | null): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  return Number(v);
}

function mapRow(r: DbRow): VariationRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    variationNumber: r.variation_number,
    title: r.title,
    description: r.description,
    lifecycleState: r.lifecycle_state,
    pricedAmountCents: asNumber(r.priced_amount_cents),
    approvedAmountCents: asNumber(r.approved_amount_cents),
    originatingInstruction: r.originating_instruction,
    submittedAt: r.submitted_at,
    disputedAt: r.disputed_at,
    closedAt: r.closed_at,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, variation_number, title, description, lifecycle_state,
         priced_amount_cents, approved_amount_cents, originating_instruction,
         submitted_at, disputed_at, closed_at,
         created_by_user_id, created_at, updated_at
    FROM variation
`;

export interface CreateVariationInput {
  readonly title: string;
  readonly description: string | null;
  readonly originatingInstruction: string | null;
}

export interface UpdateVariationInput {
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly originatingInstruction?: string | null | undefined;
  readonly pricedAmountCents?: number | null | undefined;
  readonly approvedAmountCents?: number | null | undefined;
}

@Injectable()
export class VariationsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string): Promise<VariationRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY created_at DESC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<VariationRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreateVariationInput,
    correlationId: string,
  ): Promise<VariationRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const variationNumber = await nextContractSequence(
        tx,
        'variation',
        'variation_number',
        contractId,
      );
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('variation_number', mssql.Int, variationNumber)
        .input('title', mssql.NVarChar(512), input.title)
        .input('description', mssql.NVarChar(mssql.MAX), input.description)
        .input('originating_instruction', mssql.NVarChar(1024), input.originatingInstruction)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO variation
            (id, contract_id, variation_number, title, description, originating_instruction, created_by_user_id)
          VALUES
            (@id, @contract_id, @variation_number, @title, @description, @originating_instruction, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'variation.create',
        entityType: 'Variation',
        entityId: id,
        after: { contractId, variationNumber, title: input.title },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const created = await this.get(id);
    if (!created) throw new Error('Variation disappeared after create');
    return created;
  }

  async update(
    principal: Principal,
    id: string,
    input: UpdateVariationInput,
    correlationId: string,
  ): Promise<VariationRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Variation not found');

    const sets: string[] = [];
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx).input('id', mssql.Char(26), id);
      if (input.title !== undefined) {
        sets.push('title = @title');
        req.input('title', mssql.NVarChar(512), input.title);
      }
      if (input.description !== undefined) {
        sets.push('description = @description');
        req.input('description', mssql.NVarChar(mssql.MAX), input.description);
      }
      if (input.originatingInstruction !== undefined) {
        sets.push('originating_instruction = @originating_instruction');
        req.input('originating_instruction', mssql.NVarChar(1024), input.originatingInstruction);
      }
      if (input.pricedAmountCents !== undefined) {
        sets.push('priced_amount_cents = @priced_amount_cents');
        req.input('priced_amount_cents', mssql.BigInt, input.pricedAmountCents);
      }
      if (input.approvedAmountCents !== undefined) {
        sets.push('approved_amount_cents = @approved_amount_cents');
        req.input('approved_amount_cents', mssql.BigInt, input.approvedAmountCents);
      }
      if (sets.length === 0) {
        await tx.rollback();
        return current;
      }
      sets.push('updated_at = SYSDATETIMEOFFSET()');
      await req.query(`UPDATE variation SET ${sets.join(', ')} WHERE id = @id;`);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'variation.update',
        entityType: 'Variation',
        entityId: id,
        before: { lifecycleState: current.lifecycleState },
        after: input as Record<string, unknown>,
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Variation disappeared after update');
    return updated;
  }

  async transition(
    principal: Principal,
    id: string,
    target: VariationLifecycleState,
    correlationId: string,
  ): Promise<VariationRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Variation not found');
    if (!isLegalVariationTransition(current.lifecycleState, target)) {
      throw new ConflictError(
        `Illegal variation transition: ${current.lifecycleState} → ${target}`,
        { from: current.lifecycleState, to: target },
      );
    }
    if (target === 'Submitted' && current.pricedAmountCents === null) {
      throw new ValidationError('Cannot submit a variation without priced_amount_cents');
    }

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('target', mssql.VarChar(32), target);
      const setClauses = ['lifecycle_state = @target', 'updated_at = SYSDATETIMEOFFSET()'];
      if (target === 'Submitted') {
        req.input('submitted_at', mssql.DateTimeOffset, utcNow());
        setClauses.push('submitted_at = @submitted_at');
      } else if (target === 'Disputed') {
        req.input('disputed_at', mssql.DateTimeOffset, utcNow());
        setClauses.push('disputed_at = @disputed_at');
      } else if (target === 'Closed') {
        req.input('closed_at', mssql.DateTimeOffset, utcNow());
        setClauses.push('closed_at = @closed_at');
      }
      await req.query(`
        UPDATE variation SET ${setClauses.join(', ')}
         WHERE id = @id AND lifecycle_state = '${current.lifecycleState}';
      `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'variation.lifecycle.transition',
        entityType: 'Variation',
        entityId: id,
        before: { lifecycleState: current.lifecycleState },
        after: { lifecycleState: target },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Variation disappeared after transition');
    return updated;
  }

  async link(
    principal: Principal,
    variationId: string,
    target: { kind: 'clause' | 'email' | 'document' | 'claim'; id: string },
    correlationId: string,
  ): Promise<void> {
    const tableMap = {
      clause: 'variation_clause_link',
      email: 'variation_email_link',
      document: 'variation_document_link',
      claim: 'variation_claim_link',
    };
    const colMap = {
      clause: 'clause_id',
      email: 'email_id',
      document: 'document_id',
      claim: 'claim_id',
    };
    const table = tableMap[target.kind];
    const col = colMap[target.kind];
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('variation_id', mssql.Char(26), variationId)
        .input('target_id', mssql.Char(26), target.id)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM ${table} WHERE variation_id = @variation_id AND ${col} = @target_id)
          INSERT INTO ${table} (variation_id, ${col}) VALUES (@variation_id, @target_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'variation.link',
        entityType: 'Variation',
        entityId: variationId,
        after: { linkKind: target.kind, targetId: target.id },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async listLinks(variationId: string): Promise<{
    clauses: string[];
    emails: string[];
    documents: string[];
    claims: string[];
  }> {
    const [cl, em, doc, cla] = await Promise.all([
      this.pool.request().input('id', mssql.Char(26), variationId).query<{ clause_id: string }>(
        'SELECT clause_id FROM variation_clause_link WHERE variation_id = @id',
      ),
      this.pool.request().input('id', mssql.Char(26), variationId).query<{ email_id: string }>(
        'SELECT email_id FROM variation_email_link WHERE variation_id = @id',
      ),
      this.pool.request().input('id', mssql.Char(26), variationId).query<{ document_id: string }>(
        'SELECT document_id FROM variation_document_link WHERE variation_id = @id',
      ),
      this.pool.request().input('id', mssql.Char(26), variationId).query<{ claim_id: string }>(
        'SELECT claim_id FROM variation_claim_link WHERE variation_id = @id',
      ),
    ]);
    return {
      clauses: cl.recordset.map((r) => r.clause_id),
      emails: em.recordset.map((r) => r.email_id),
      documents: doc.recordset.map((r) => r.document_id),
      claims: cla.recordset.map((r) => r.claim_id),
    };
  }
}
