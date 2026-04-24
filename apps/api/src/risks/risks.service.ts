import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type {
  RiskCategory,
  RiskLikelihood,
  RiskSource,
  RiskStatus,
} from '@ckb/domain';
import { newUlid, NotFoundError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface RiskRow {
  readonly id: string;
  readonly contractId: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: RiskCategory;
  readonly ownerUserId: string | null;
  readonly probability: RiskLikelihood;
  readonly impact: RiskLikelihood;
  readonly mitigation: string | null;
  readonly residualProbability: RiskLikelihood | null;
  readonly residualImpact: RiskLikelihood | null;
  readonly status: RiskStatus;
  readonly source: RiskSource;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  category: RiskCategory;
  owner_user_id: string | null;
  probability: RiskLikelihood;
  impact: RiskLikelihood;
  mitigation: string | null;
  residual_probability: RiskLikelihood | null;
  residual_impact: RiskLikelihood | null;
  status: RiskStatus;
  source: RiskSource;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: DbRow): RiskRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    title: r.title,
    description: r.description,
    category: r.category,
    ownerUserId: r.owner_user_id,
    probability: r.probability,
    impact: r.impact,
    mitigation: r.mitigation,
    residualProbability: r.residual_probability,
    residualImpact: r.residual_impact,
    status: r.status,
    source: r.source,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, title, description, category, owner_user_id,
         probability, impact, mitigation, residual_probability, residual_impact,
         status, source, created_by_user_id, created_at, updated_at
    FROM risk
`;

export interface CreateRiskInput {
  readonly title: string;
  readonly description: string | null;
  readonly category: RiskCategory;
  readonly ownerUserId: string | null;
  readonly probability: RiskLikelihood;
  readonly impact: RiskLikelihood;
  readonly mitigation: string | null;
  readonly source?: RiskSource;
}

export interface UpdateRiskInput {
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly category?: RiskCategory | undefined;
  readonly ownerUserId?: string | null | undefined;
  readonly probability?: RiskLikelihood | undefined;
  readonly impact?: RiskLikelihood | undefined;
  readonly mitigation?: string | null | undefined;
  readonly residualProbability?: RiskLikelihood | null | undefined;
  readonly residualImpact?: RiskLikelihood | null | undefined;
  readonly status?: RiskStatus | undefined;
}

@Injectable()
export class RisksService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string, status?: RiskStatus): Promise<RiskRow[]> {
    const clauses = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (status) {
      clauses.push('status = @status');
      req.input('status', mssql.VarChar(16), status);
    }
    const r = await req.query<DbRow>(
      `${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    );
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<RiskRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreateRiskInput,
    correlationId: string,
  ): Promise<RiskRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('title', mssql.NVarChar(512), input.title)
        .input('description', mssql.NVarChar(mssql.MAX), input.description)
        .input('category', mssql.VarChar(40), input.category)
        .input('owner_user_id', mssql.Char(26), input.ownerUserId)
        .input('probability', mssql.VarChar(8), input.probability)
        .input('impact', mssql.VarChar(8), input.impact)
        .input('mitigation', mssql.NVarChar(mssql.MAX), input.mitigation)
        .input('source', mssql.VarChar(24), input.source ?? 'Manual')
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO risk
            (id, contract_id, title, description, category, owner_user_id,
             probability, impact, mitigation, source, created_by_user_id)
          VALUES
            (@id, @contract_id, @title, @description, @category, @owner_user_id,
             @probability, @impact, @mitigation, @source, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'risk.create',
        entityType: 'Risk',
        entityId: id,
        after: { contractId, title: input.title, category: input.category },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Risk disappeared after create');
    return row;
  }

  async update(
    principal: Principal,
    id: string,
    input: UpdateRiskInput,
    correlationId: string,
  ): Promise<RiskRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Risk not found');
    const sets: string[] = [];
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx).input('id', mssql.Char(26), id);
      const maybe = <T>(col: string, sqlType: mssql.ISqlType | (() => mssql.ISqlType), value: T | undefined, fieldName: string): void => {
        if (value !== undefined) {
          sets.push(`${col} = @${fieldName}`);
          req.input(fieldName, sqlType, value as unknown as never);
        }
      };
      maybe('title', mssql.NVarChar(512), input.title, 'title');
      maybe('description', mssql.NVarChar(mssql.MAX), input.description, 'description');
      maybe('category', mssql.VarChar(40), input.category, 'category');
      maybe('owner_user_id', mssql.Char(26), input.ownerUserId, 'owner_user_id');
      maybe('probability', mssql.VarChar(8), input.probability, 'probability');
      maybe('impact', mssql.VarChar(8), input.impact, 'impact');
      maybe('mitigation', mssql.NVarChar(mssql.MAX), input.mitigation, 'mitigation');
      maybe('residual_probability', mssql.VarChar(8), input.residualProbability, 'residual_probability');
      maybe('residual_impact', mssql.VarChar(8), input.residualImpact, 'residual_impact');
      maybe('status', mssql.VarChar(16), input.status, 'status');
      if (sets.length === 0) {
        await tx.rollback();
        return current;
      }
      sets.push('updated_at = SYSDATETIMEOFFSET()');
      await req.query(`UPDATE risk SET ${sets.join(', ')} WHERE id = @id;`);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'risk.update',
        entityType: 'Risk',
        entityId: id,
        before: { status: current.status },
        after: input as Record<string, unknown>,
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Risk disappeared after update');
    return updated;
  }
}
