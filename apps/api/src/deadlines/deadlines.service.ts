import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  computeDueAt,
  isLegalDeadlineTransition,
  type DeadlineLifecycleState,
} from '@ckb/domain';
import {
  ConflictError,
  ForbiddenError,
  newUlid,
  NotFoundError,
  utcNow,
  ValidationError,
} from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

/**
 * Deadline tracker service (§5.5).
 *
 * Verification gate (Non-Negotiable #2): only Verified deadlines may reach
 * `Active` state, which is the only state in which external alerts fire.
 */

export interface DeadlineRow {
  readonly id: string;
  readonly contractId: string;
  readonly label: string;
  readonly responsibleParty: string;
  readonly triggerCondition: string | null;
  readonly durationDays: number | null;
  readonly absoluteDate: string | null;
  readonly alertLeadDays: number;
  readonly consequence: string | null;
  readonly verificationState: 'Unverified' | 'Verified';
  readonly lifecycleState: DeadlineLifecycleState;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly sourceCitation: string | null;
  readonly extractedByCapabilityVersion: string | null;
  readonly createdByUserId: string;
  readonly verifiedByUserId: string | null;
  readonly verifiedAt: Date | null;
  readonly completedAt: Date | null;
  readonly completedByUserId: string | null;
  readonly dueAt: Date | null;
  readonly triggeredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDeadlineInput {
  readonly label: string;
  readonly responsibleParty: 'Contractor' | 'Client' | 'Consultant' | 'Other';
  readonly triggerCondition: string | null;
  readonly durationDays: number | null;
  readonly absoluteDate: string | null;
  readonly alertLeadDays: number;
  readonly consequence: string | null;
  readonly sourceType:
    | 'Clause'
    | 'Email'
    | 'Document'
    | 'CalendarEvent'
    | 'Manual'
    | 'MeetingMinutes';
  readonly sourceId: string | null;
  readonly sourceCitation: string | null;
  readonly extractedByCapabilityVersion: string | null;
}

interface DbRow {
  id: string;
  contract_id: string;
  label: string;
  responsible_party: string;
  trigger_condition: string | null;
  duration_days: number | null;
  absolute_date: Date | string | null;
  alert_lead_days: number;
  consequence: string | null;
  verification_state: 'Unverified' | 'Verified';
  lifecycle_state: DeadlineLifecycleState;
  source_type: string;
  source_id: string | null;
  source_citation: string | null;
  extracted_by_capability_version: string | null;
  created_by_user_id: string;
  verified_by_user_id: string | null;
  verified_at: Date | null;
  completed_at: Date | null;
  completed_by_user_id: string | null;
  due_at: Date | null;
  triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function isoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function mapRow(r: DbRow): DeadlineRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    label: r.label,
    responsibleParty: r.responsible_party,
    triggerCondition: r.trigger_condition,
    durationDays: r.duration_days,
    absoluteDate: isoDate(r.absolute_date),
    alertLeadDays: r.alert_lead_days,
    consequence: r.consequence,
    verificationState: r.verification_state,
    lifecycleState: r.lifecycle_state,
    sourceType: r.source_type,
    sourceId: r.source_id,
    sourceCitation: r.source_citation,
    extractedByCapabilityVersion: r.extracted_by_capability_version,
    createdByUserId: r.created_by_user_id,
    verifiedByUserId: r.verified_by_user_id,
    verifiedAt: r.verified_at,
    completedAt: r.completed_at,
    completedByUserId: r.completed_by_user_id,
    dueAt: r.due_at,
    triggeredAt: r.triggered_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const DEADLINE_SELECT = `
  SELECT id, contract_id, label, responsible_party, trigger_condition,
         duration_days, absolute_date, alert_lead_days, consequence,
         verification_state, lifecycle_state, source_type, source_id,
         source_citation, extracted_by_capability_version,
         created_by_user_id, verified_by_user_id, verified_at,
         completed_at, completed_by_user_id, due_at, triggered_at,
         created_at, updated_at
    FROM deadline
`;

@Injectable()
export class DeadlinesService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listForContract(
    contractId: string,
    options: {
      verificationState?: 'Unverified' | 'Verified';
      lifecycleState?: DeadlineLifecycleState;
    } = {},
  ): Promise<DeadlineRow[]> {
    const clauses = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (options.verificationState) {
      clauses.push('verification_state = @vs');
      req.input('vs', mssql.VarChar(16), options.verificationState);
    }
    if (options.lifecycleState) {
      clauses.push('lifecycle_state = @ls');
      req.input('ls', mssql.VarChar(24), options.lifecycleState);
    }
    const r = await req.query<DbRow>(
      `${DEADLINE_SELECT} WHERE ${clauses.join(' AND ')}
       ORDER BY (CASE WHEN due_at IS NULL THEN 1 ELSE 0 END), due_at ASC, created_at DESC`,
    );
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<DeadlineRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${DEADLINE_SELECT} WHERE id = @id`);
    const row = r.recordset[0];
    return row ? mapRow(row) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreateDeadlineInput,
    correlationId: string,
  ): Promise<DeadlineRow> {
    if (!input.absoluteDate && input.durationDays === null) {
      throw new ValidationError(
        'Deadline requires either an absoluteDate or a durationDays + triggerCondition',
      );
    }
    const id = newUlid();
    const now = utcNow();
    const dueAt = computeDueAt({
      absoluteDate: input.absoluteDate,
      durationDays: input.durationDays,
      triggeredAt: null,
    });
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('label', mssql.NVarChar(512), input.label)
        .input('responsible_party', mssql.VarChar(24), input.responsibleParty)
        .input('trigger_condition', mssql.NVarChar(1024), input.triggerCondition)
        .input('duration_days', mssql.Int, input.durationDays)
        .input('absolute_date', mssql.Date, input.absoluteDate)
        .input('alert_lead_days', mssql.Int, input.alertLeadDays)
        .input('consequence', mssql.NVarChar(1024), input.consequence)
        .input('source_type', mssql.VarChar(24), input.sourceType)
        .input('source_id', mssql.Char(26), input.sourceId)
        .input('source_citation', mssql.NVarChar(256), input.sourceCitation)
        .input('extracted_by_capability_version', mssql.VarChar(64), input.extractedByCapabilityVersion)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .input('due_at', mssql.DateTimeOffset, dueAt)
        .input('now', mssql.DateTimeOffset, now)
        .query(`
          INSERT INTO deadline
            (id, contract_id, label, responsible_party, trigger_condition,
             duration_days, absolute_date, alert_lead_days, consequence,
             verification_state, lifecycle_state, source_type, source_id,
             source_citation, extracted_by_capability_version,
             created_by_user_id, due_at, created_at, updated_at)
          VALUES
            (@id, @contract_id, @label, @responsible_party, @trigger_condition,
             @duration_days, @absolute_date, @alert_lead_days, @consequence,
             'Unverified', 'Extracted', @source_type, @source_id,
             @source_citation, @extracted_by_capability_version,
             @created_by_user_id, @due_at, @now, @now);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: input.sourceType === 'Manual' ? 'deadline.create' : 'deadline.extract',
        entityType: 'Deadline',
        entityId: id,
        after: { contractId, label: input.label, sourceType: input.sourceType, dueAt },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const created = await this.get(id);
    if (!created) throw new Error('Deadline disappeared after create');
    return created;
  }

  async verify(
    principal: Principal,
    id: string,
    role: string,
    correlationId: string,
  ): Promise<DeadlineRow> {
    if (role !== 'Owner' && role !== 'Administrator') {
      throw new ForbiddenError(
        'Only Owner or Administrator can verify a deadline (Non-Negotiable #2)',
      );
    }
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Deadline not found');
    if (current.verificationState === 'Verified') {
      return current;
    }
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('verified_by_user_id', mssql.Char(26), principal.userId)
        .input('verified_at', mssql.DateTimeOffset, utcNow())
        .query(`
          UPDATE deadline
             SET verification_state = 'Verified',
                 lifecycle_state = 'Verified',
                 verified_by_user_id = @verified_by_user_id,
                 verified_at = @verified_at,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id AND verification_state = 'Unverified';
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'deadline.verify',
        entityType: 'Deadline',
        entityId: id,
        before: {
          verificationState: current.verificationState,
          lifecycleState: current.lifecycleState,
        },
        after: { verificationState: 'Verified', lifecycleState: 'Verified' },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Deadline disappeared after verify');
    return updated;
  }

  async transition(
    principal: Principal,
    id: string,
    target: DeadlineLifecycleState,
    correlationId: string,
  ): Promise<DeadlineRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Deadline not found');
    if (!isLegalDeadlineTransition(current.lifecycleState, target)) {
      throw new ConflictError(
        `Illegal deadline transition: ${current.lifecycleState} → ${target}`,
        { from: current.lifecycleState, to: target },
      );
    }
    if (target === 'Active' && current.verificationState !== 'Verified') {
      throw new ValidationError(
        'Cannot activate an Unverified deadline (Non-Negotiable #2 — external alerts require Verified)',
      );
    }

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      if (target === 'Complete' || target === 'Missed') {
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), id)
          .input('target', mssql.VarChar(24), target)
          .input('completed_by_user_id', mssql.Char(26), principal.userId)
          .input('completed_at', mssql.DateTimeOffset, utcNow())
          .query(`
            UPDATE deadline
               SET lifecycle_state = @target,
                   completed_at = @completed_at,
                   completed_by_user_id = @completed_by_user_id,
                   updated_at = SYSDATETIMEOFFSET()
             WHERE id = @id AND lifecycle_state = @from;
          `.replace('@from', `'${current.lifecycleState}'`));
      } else if (target === 'Triggered') {
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), id)
          .input('target', mssql.VarChar(24), target)
          .input('triggered_at', mssql.DateTimeOffset, utcNow())
          .query(`
            UPDATE deadline
               SET lifecycle_state = @target,
                   triggered_at = @triggered_at,
                   updated_at = SYSDATETIMEOFFSET()
             WHERE id = @id AND lifecycle_state = @from;
          `.replace('@from', `'${current.lifecycleState}'`));
        // Recompute due_at when the trigger fires (for duration-based deadlines).
        await this.recomputeDueAt(tx, id);
      } else {
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), id)
          .input('target', mssql.VarChar(24), target)
          .query(`
            UPDATE deadline
               SET lifecycle_state = @target,
                   updated_at = SYSDATETIMEOFFSET()
             WHERE id = @id AND lifecycle_state = @from;
          `.replace('@from', `'${current.lifecycleState}'`));
      }

      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'deadline.transition',
        entityType: 'Deadline',
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
    if (!updated) throw new Error('Deadline disappeared after transition');
    return updated;
  }

  private async recomputeDueAt(tx: mssql.Transaction, id: string): Promise<void> {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), id)
      .query(`
        UPDATE deadline
           SET due_at = CASE
             WHEN absolute_date IS NOT NULL THEN CAST(absolute_date AS DATETIMEOFFSET)
             WHEN duration_days IS NOT NULL AND triggered_at IS NOT NULL
               THEN DATEADD(DAY, duration_days, triggered_at)
             ELSE NULL
           END
         WHERE id = @id;
      `);
  }
}
