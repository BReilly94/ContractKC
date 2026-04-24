import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  isLegalSubmittalTransition,
  type SubmittalLifecycleState,
} from '@ckb/domain';
import {
  ConflictError,
  newUlid,
  NotFoundError,
  utcNow,
} from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';
import { nextContractSequence } from '../common/register-helpers.js';

export interface SubmittalRow {
  readonly id: string;
  readonly contractId: string;
  readonly submittalNumber: number | null;
  readonly title: string;
  readonly discipline: string | null;
  readonly workPackage: string | null;
  readonly description: string | null;
  readonly previousSubmittalId: string | null;
  readonly lifecycleState: SubmittalLifecycleState;
  readonly reviewOutcome: SubmittalLifecycleState | null;
  readonly reviewClockStart: Date | null;
  readonly reviewClockDays: number | null;
  readonly submittedAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  submittal_number: number | null;
  title: string;
  discipline: string | null;
  work_package: string | null;
  description: string | null;
  previous_submittal_id: string | null;
  lifecycle_state: SubmittalLifecycleState;
  review_outcome: SubmittalLifecycleState | null;
  review_clock_start: Date | null;
  review_clock_days: number | null;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  closed_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: DbRow): SubmittalRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    submittalNumber: r.submittal_number,
    title: r.title,
    discipline: r.discipline,
    workPackage: r.work_package,
    description: r.description,
    previousSubmittalId: r.previous_submittal_id,
    lifecycleState: r.lifecycle_state,
    reviewOutcome: r.review_outcome,
    reviewClockStart: r.review_clock_start,
    reviewClockDays: r.review_clock_days,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    closedAt: r.closed_at,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, submittal_number, title, discipline, work_package,
         description, previous_submittal_id, lifecycle_state, review_outcome,
         review_clock_start, review_clock_days,
         submitted_at, reviewed_at, closed_at,
         created_by_user_id, created_at, updated_at
    FROM submittal
`;

export interface CreateSubmittalInput {
  readonly title: string;
  readonly discipline: string | null;
  readonly workPackage: string | null;
  readonly description: string | null;
  readonly previousSubmittalId: string | null;
  readonly reviewClockDays: number | null;
}

@Injectable()
export class SubmittalsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string): Promise<SubmittalRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY created_at DESC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<SubmittalRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreateSubmittalInput,
    correlationId: string,
  ): Promise<SubmittalRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const submittalNumber = await nextContractSequence(
        tx,
        'submittal',
        'submittal_number',
        contractId,
      );
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('submittal_number', mssql.Int, submittalNumber)
        .input('title', mssql.NVarChar(512), input.title)
        .input('discipline', mssql.VarChar(40), input.discipline)
        .input('work_package', mssql.VarChar(80), input.workPackage)
        .input('description', mssql.NVarChar(mssql.MAX), input.description)
        .input('previous_submittal_id', mssql.Char(26), input.previousSubmittalId)
        .input('review_clock_days', mssql.Int, input.reviewClockDays)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO submittal
            (id, contract_id, submittal_number, title, discipline, work_package,
             description, previous_submittal_id, review_clock_days, created_by_user_id)
          VALUES
            (@id, @contract_id, @submittal_number, @title, @discipline, @work_package,
             @description, @previous_submittal_id, @review_clock_days, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'submittal.create',
        entityType: 'Submittal',
        entityId: id,
        after: { contractId, submittalNumber, title: input.title },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Submittal disappeared after create');
    return row;
  }

  async transition(
    principal: Principal,
    id: string,
    target: SubmittalLifecycleState,
    correlationId: string,
  ): Promise<SubmittalRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Submittal not found');
    if (!isLegalSubmittalTransition(current.lifecycleState, target)) {
      throw new ConflictError(
        `Illegal submittal transition: ${current.lifecycleState} → ${target}`,
      );
    }

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('target', mssql.VarChar(32), target);
      const sets = ['lifecycle_state = @target', 'updated_at = SYSDATETIMEOFFSET()'];
      if (target === 'Submitted') {
        req.input('now', mssql.DateTimeOffset, utcNow());
        sets.push('submitted_at = @now', 'review_clock_start = @now');
      } else if (target === 'UnderReview') {
        req.input('now', mssql.DateTimeOffset, utcNow());
        sets.push('reviewed_at = @now');
      } else if (
        target === 'Approved' ||
        target === 'ApprovedAsNoted' ||
        target === 'ReviseAndResubmit' ||
        target === 'Rejected'
      ) {
        req.input('outcome', mssql.VarChar(24), target);
        sets.push('review_outcome = @outcome');
      } else if (target === 'Closed') {
        req.input('now', mssql.DateTimeOffset, utcNow());
        sets.push('closed_at = @now');
      }
      await req.query(`
        UPDATE submittal SET ${sets.join(', ')}
         WHERE id = @id AND lifecycle_state = '${current.lifecycleState}';
      `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'submittal.lifecycle.transition',
        entityType: 'Submittal',
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
    if (!updated) throw new Error('Submittal disappeared after transition');
    return updated;
  }
}
