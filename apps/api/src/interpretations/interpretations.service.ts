import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import { newUlid, NotFoundError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface InterpretationRow {
  readonly id: string;
  readonly contractId: string;
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly decidedAt: string;
  readonly decidedByUserId: string;
  readonly primaryClauseId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  title: string;
  context: string;
  decision: string;
  decided_at: Date | string;
  decided_by_user_id: string;
  primary_clause_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function asIsoDate(v: Date | string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v.length >= 10 ? v.slice(0, 10) : v;
}

function mapRow(r: DbRow): InterpretationRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    title: r.title,
    context: r.context,
    decision: r.decision,
    decidedAt: asIsoDate(r.decided_at),
    decidedByUserId: r.decided_by_user_id,
    primaryClauseId: r.primary_clause_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, title, context, decision, decided_at, decided_by_user_id,
         primary_clause_id, created_at, updated_at
    FROM interpretation
`;

export interface CreateInterpretationInput {
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly decidedAt: string;
  readonly primaryClauseId: string | null;
  readonly citedClauseIds?: string[] | undefined;
  readonly citedEmailIds?: string[] | undefined;
  readonly citedDocumentIds?: string[] | undefined;
}

@Injectable()
export class InterpretationsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string): Promise<InterpretationRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY decided_at DESC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<InterpretationRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreateInterpretationInput,
    correlationId: string,
  ): Promise<InterpretationRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('title', mssql.NVarChar(512), input.title)
        .input('context', mssql.NVarChar(mssql.MAX), input.context)
        .input('decision', mssql.NVarChar(mssql.MAX), input.decision)
        .input('decided_at', mssql.Date, input.decidedAt)
        .input('decided_by_user_id', mssql.Char(26), principal.userId)
        .input('primary_clause_id', mssql.Char(26), input.primaryClauseId)
        .query(`
          INSERT INTO interpretation
            (id, contract_id, title, context, decision, decided_at, decided_by_user_id, primary_clause_id)
          VALUES
            (@id, @contract_id, @title, @context, @decision, @decided_at, @decided_by_user_id, @primary_clause_id);
        `);

      for (const clauseId of input.citedClauseIds ?? []) {
        await new mssql.Request(tx)
          .input('interp', mssql.Char(26), id)
          .input('clause', mssql.Char(26), clauseId)
          .query(
            `IF NOT EXISTS (SELECT 1 FROM interpretation_clause_link WHERE interpretation_id = @interp AND clause_id = @clause)
             INSERT INTO interpretation_clause_link (interpretation_id, clause_id) VALUES (@interp, @clause);`,
          );
      }
      for (const emailId of input.citedEmailIds ?? []) {
        await new mssql.Request(tx)
          .input('interp', mssql.Char(26), id)
          .input('email', mssql.Char(26), emailId)
          .query(
            `IF NOT EXISTS (SELECT 1 FROM interpretation_email_link WHERE interpretation_id = @interp AND email_id = @email)
             INSERT INTO interpretation_email_link (interpretation_id, email_id) VALUES (@interp, @email);`,
          );
      }
      for (const documentId of input.citedDocumentIds ?? []) {
        await new mssql.Request(tx)
          .input('interp', mssql.Char(26), id)
          .input('document', mssql.Char(26), documentId)
          .query(
            `IF NOT EXISTS (SELECT 1 FROM interpretation_document_link WHERE interpretation_id = @interp AND document_id = @document)
             INSERT INTO interpretation_document_link (interpretation_id, document_id) VALUES (@interp, @document);`,
          );
      }

      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'interpretation.create',
        entityType: 'Interpretation',
        entityId: id,
        after: { contractId, title: input.title, decidedAt: input.decidedAt },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Interpretation disappeared after create');
    return row;
  }

  async listCitations(id: string): Promise<{
    clauses: string[];
    emails: string[];
    documents: string[];
  }> {
    const [cl, em, doc] = await Promise.all([
      this.pool.request().input('id', mssql.Char(26), id).query<{ clause_id: string }>(
        'SELECT clause_id FROM interpretation_clause_link WHERE interpretation_id = @id',
      ),
      this.pool.request().input('id', mssql.Char(26), id).query<{ email_id: string }>(
        'SELECT email_id FROM interpretation_email_link WHERE interpretation_id = @id',
      ),
      this.pool.request().input('id', mssql.Char(26), id).query<{ document_id: string }>(
        'SELECT document_id FROM interpretation_document_link WHERE interpretation_id = @id',
      ),
    ]);
    return {
      clauses: cl.recordset.map((r) => r.clause_id),
      emails: em.recordset.map((r) => r.email_id),
      documents: doc.recordset.map((r) => r.document_id),
    };
  }
}
