import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type {
  RedactionReasonCategory,
  RedactionScope,
  RedactionTargetType,
} from '@ckb/domain';
import { ConflictError, newUlid, NotFoundError, ValidationError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface RedactionRow {
  readonly id: string;
  readonly contractId: string;
  readonly targetType: RedactionTargetType;
  readonly targetId: string;
  readonly targetPage: number | null;
  readonly spanStart: number | null;
  readonly spanEnd: number | null;
  readonly scope: RedactionScope;
  readonly reasonCategory: RedactionReasonCategory;
  readonly reasonNote: string | null;
  readonly redactedByUserId: string;
  readonly redactedAt: Date;
  readonly reversedAt: Date | null;
  readonly reversedByUserId: string | null;
  readonly reversalReason: string | null;
}

interface DbRow {
  id: string;
  contract_id: string;
  target_type: RedactionTargetType;
  target_id: string;
  target_page: number | null;
  span_start: number | null;
  span_end: number | null;
  scope: RedactionScope;
  reason_category: RedactionReasonCategory;
  reason_note: string | null;
  redacted_by_user_id: string;
  redacted_at: Date;
  reversed_at: Date | null;
  reversed_by_user_id: string | null;
  reversal_reason: string | null;
}

const SELECT = `
  SELECT id, contract_id, target_type, target_id, target_page, span_start, span_end,
         scope, reason_category, reason_note, redacted_by_user_id, redacted_at,
         reversed_at, reversed_by_user_id, reversal_reason
    FROM redaction
`;

function mapRow(r: DbRow): RedactionRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    targetType: r.target_type,
    targetId: r.target_id,
    targetPage: r.target_page,
    spanStart: r.span_start,
    spanEnd: r.span_end,
    scope: r.scope,
    reasonCategory: r.reason_category,
    reasonNote: r.reason_note,
    redactedByUserId: r.redacted_by_user_id,
    redactedAt: r.redacted_at,
    reversedAt: r.reversed_at,
    reversedByUserId: r.reversed_by_user_id,
    reversalReason: r.reversal_reason,
  };
}

export interface CreateRedactionInput {
  targetType: RedactionTargetType;
  targetId: string;
  targetPage: number | null;
  spanStart: number | null;
  spanEnd: number | null;
  scope: RedactionScope;
  reasonCategory: RedactionReasonCategory;
  reasonNote: string | null;
}

@Injectable()
export class RedactionsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async apply(
    principal: Principal,
    contractId: string,
    input: CreateRedactionInput,
    correlationId: string,
  ): Promise<RedactionRow> {
    if (input.scope === 'Passage' && (input.spanStart === null || input.spanEnd === null)) {
      throw new ValidationError('Passage-scoped redactions require spanStart and spanEnd');
    }
    if (input.scope === 'Page' && input.targetPage === null) {
      throw new ValidationError('Page-scoped redactions require targetPage');
    }
    if (input.spanStart !== null && input.spanEnd !== null && input.spanEnd <= input.spanStart) {
      throw new ValidationError('spanEnd must be greater than spanStart');
    }

    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('target_type', mssql.VarChar(24), input.targetType)
        .input('target_id', mssql.Char(26), input.targetId)
        .input('target_page', mssql.Int, input.targetPage)
        .input('span_start', mssql.Int, input.spanStart)
        .input('span_end', mssql.Int, input.spanEnd)
        .input('scope', mssql.VarChar(16), input.scope)
        .input('reason_category', mssql.VarChar(40), input.reasonCategory)
        .input('reason_note', mssql.NVarChar(1024), input.reasonNote)
        .input('redacted_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO redaction
            (id, contract_id, target_type, target_id, target_page, span_start, span_end,
             scope, reason_category, reason_note, redacted_by_user_id)
          VALUES
            (@id, @contract_id, @target_type, @target_id, @target_page, @span_start, @span_end,
             @scope, @reason_category, @reason_note, @redacted_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'redaction.apply',
        entityType: 'Redaction',
        entityId: id,
        after: {
          contractId,
          targetType: input.targetType,
          targetId: input.targetId,
          scope: input.scope,
          reasonCategory: input.reasonCategory,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Redaction disappeared after create');
    return row;
  }

  async reverse(
    principal: Principal,
    contractId: string,
    redactionId: string,
    reversalReason: string,
    correlationId: string,
  ): Promise<void> {
    const current = await this.get(redactionId);
    if (!current || current.contractId !== contractId) {
      throw new NotFoundError('Redaction not found');
    }
    if (current.reversedAt !== null) {
      throw new ConflictError('Redaction already reversed');
    }
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), redactionId)
        .input('reversed_by_user_id', mssql.Char(26), principal.userId)
        .input('reversal_reason', mssql.NVarChar(1024), reversalReason)
        .query(`
          UPDATE redaction
             SET reversed_at = SYSDATETIMEOFFSET(),
                 reversed_by_user_id = @reversed_by_user_id,
                 reversal_reason = @reversal_reason
           WHERE id = @id;
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'redaction.reverse',
        entityType: 'Redaction',
        entityId: redactionId,
        after: { reversalReason },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async get(id: string): Promise<RedactionRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async listForContract(
    contractId: string,
    options: { activeOnly?: boolean } = {},
  ): Promise<RedactionRow[]> {
    const clauses = ['contract_id = @contract_id'];
    if (options.activeOnly) clauses.push('reversed_at IS NULL');
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY redacted_at DESC`);
    return r.recordset.map(mapRow);
  }

  async listForTarget(
    contractId: string,
    targetType: RedactionTargetType,
    targetId: string,
  ): Promise<RedactionRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .input('target_type', mssql.VarChar(24), targetType)
      .input('target_id', mssql.Char(26), targetId)
      .query<DbRow>(`
        ${SELECT} WHERE contract_id = @contract_id
                   AND target_type = @target_type
                   AND target_id = @target_id
                   AND reversed_at IS NULL
        ORDER BY redacted_at ASC
      `);
    return r.recordset.map(mapRow);
  }
}
