import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface ClauseRow {
  readonly id: string;
  readonly contractId: string;
  readonly sourceDocumentId: string;
  readonly clauseNumber: string | null;
  readonly heading: string | null;
  readonly text: string;
  readonly clauseType: string;
  readonly extractionConfidence: string;
  readonly verificationState: 'Unverified' | 'Verified';
  readonly supersedesClauseId: string | null;
  readonly isSuperseded: boolean;
  readonly createdAt: Date;
}

export interface ClauseRelationshipRow {
  readonly id: string;
  readonly fromClauseId: string;
  readonly toClauseId: string | null;
  readonly toEmailId: string | null;
  readonly toDocumentId: string | null;
  readonly relationship: string;
  readonly createdBy: 'AI' | 'Human';
  readonly verificationState: 'Unverified' | 'Verified';
  readonly createdAt: Date;
}

interface DbClauseRow {
  id: string;
  contract_id: string;
  source_document_id: string;
  clause_number: string | null;
  heading: string | null;
  text: string;
  clause_type: string;
  extraction_confidence: string;
  verification_state: 'Unverified' | 'Verified';
  supersedes_clause_id: string | null;
  is_superseded: boolean | number;
  created_at: Date;
}

function mapClause(r: DbClauseRow): ClauseRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    sourceDocumentId: r.source_document_id,
    clauseNumber: r.clause_number,
    heading: r.heading,
    text: r.text,
    clauseType: r.clause_type,
    extractionConfidence: r.extraction_confidence,
    verificationState: r.verification_state,
    supersedesClauseId: r.supersedes_clause_id,
    isSuperseded: Boolean(r.is_superseded),
    createdAt: r.created_at,
  };
}

@Injectable()
export class ClausesService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listByDocument(documentId: string): Promise<ClauseRow[]> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), documentId)
      .query<DbClauseRow>(`
        SELECT id, contract_id, source_document_id, clause_number, heading,
               [text], clause_type, extraction_confidence, verification_state,
               supersedes_clause_id, is_superseded, created_at
          FROM clause
         WHERE source_document_id = @id AND is_superseded = 0
         ORDER BY clause_number ASC, created_at ASC
      `);
    return r.recordset.map(mapClause);
  }

  async listByContract(contractId: string, clauseType?: string): Promise<ClauseRow[]> {
    const clauses = ['contract_id = @contract_id', 'is_superseded = 0'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (clauseType) {
      clauses.push('clause_type = @clause_type');
      req.input('clause_type', mssql.VarChar(40), clauseType);
    }
    const r = await req.query<DbClauseRow>(`
      SELECT id, contract_id, source_document_id, clause_number, heading,
             [text], clause_type, extraction_confidence, verification_state,
             supersedes_clause_id, is_superseded, created_at
        FROM clause
       WHERE ${clauses.join(' AND ')}
       ORDER BY clause_number ASC, created_at ASC
    `);
    return r.recordset.map(mapClause);
  }

  async get(id: string): Promise<ClauseRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbClauseRow>(`
        SELECT id, contract_id, source_document_id, clause_number, heading,
               [text], clause_type, extraction_confidence, verification_state,
               supersedes_clause_id, is_superseded, created_at
          FROM clause WHERE id = @id
      `);
    const row = r.recordset[0];
    return row ? mapClause(row) : null;
  }

  async relationshipsFor(clauseId: string): Promise<ClauseRelationshipRow[]> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), clauseId)
      .query<{
        id: string;
        from_clause_id: string;
        to_clause_id: string | null;
        to_email_id: string | null;
        to_document_id: string | null;
        relationship: string;
        created_by: 'AI' | 'Human';
        verification_state: 'Unverified' | 'Verified';
        created_at: Date;
      }>(`
        SELECT id, from_clause_id, to_clause_id, to_email_id, to_document_id,
               relationship, created_by, verification_state, created_at
          FROM clause_relationship
         WHERE from_clause_id = @id OR to_clause_id = @id
      `);
    return r.recordset.map((row) => ({
      id: row.id,
      fromClauseId: row.from_clause_id,
      toClauseId: row.to_clause_id,
      toEmailId: row.to_email_id,
      toDocumentId: row.to_document_id,
      relationship: row.relationship,
      createdBy: row.created_by,
      verificationState: row.verification_state,
      createdAt: row.created_at,
    }));
  }
}
