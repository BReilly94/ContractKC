import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type { AuditAction } from '@ckb/domain';
import { ConflictError, NotFoundError, utcNow } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface ReviewQueueItem {
  readonly id: string;
  readonly emailId: string;
  readonly contractId: string;
  readonly reason: string;
  readonly reasonDetail: string | null;
  readonly state: string;
  readonly assignedToUserId: string | null;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly resolutionNotes: string | null;
  readonly createdAt: Date;
  // Convenience join from email for display.
  readonly emailSubject: string;
  readonly emailFromAddress: string;
  readonly emailReceivedAt: Date;
}

interface DbRow {
  id: string;
  email_id: string;
  contract_id: string;
  reason: string;
  reason_detail: string | null;
  state: string;
  assigned_to_user_id: string | null;
  resolved_at: Date | null;
  resolved_by_user_id: string | null;
  resolution_notes: string | null;
  created_at: Date;
  email_subject: string;
  email_from_address: string;
  email_received_at: Date;
}

const SELECT_JOIN = `
  SELECT q.id, q.email_id, q.contract_id, q.reason, q.reason_detail, q.state,
         q.assigned_to_user_id, q.resolved_at, q.resolved_by_user_id,
         q.resolution_notes, q.created_at,
         e.subject AS email_subject, e.from_address AS email_from_address,
         e.received_at AS email_received_at
    FROM email_review_queue_item q
    JOIN email e ON e.id = q.email_id
`;

function mapRow(r: DbRow): ReviewQueueItem {
  return {
    id: r.id,
    emailId: r.email_id,
    contractId: r.contract_id,
    reason: r.reason,
    reasonDetail: r.reason_detail,
    state: r.state,
    assignedToUserId: r.assigned_to_user_id,
    resolvedAt: r.resolved_at,
    resolvedByUserId: r.resolved_by_user_id,
    resolutionNotes: r.resolution_notes,
    createdAt: r.created_at,
    emailSubject: r.email_subject,
    emailFromAddress: r.email_from_address,
    emailReceivedAt: r.email_received_at,
  };
}

@Injectable()
export class ReviewQueueService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listForContract(
    contractId: string,
    options: { state?: 'Pending' | 'Approved' | 'Rejected' | 'Actioned'; reason?: string } = {},
  ): Promise<ReviewQueueItem[]> {
    const clauses = ['q.contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (options.state) {
      clauses.push('q.state = @state');
      req.input('state', mssql.VarChar(16), options.state);
    }
    if (options.reason) {
      clauses.push('q.reason = @reason');
      req.input('reason', mssql.VarChar(40), options.reason);
    }
    const r = await req.query<DbRow>(
      `${SELECT_JOIN} WHERE ${clauses.join(' AND ')} ORDER BY q.created_at DESC`,
    );
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<ReviewQueueItem | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT_JOIN} WHERE q.id = @id`);
    const row = r.recordset[0];
    return row ? mapRow(row) : null;
  }

  async approve(
    principal: Principal,
    id: string,
    notes: string | null,
    correlationId: string,
  ): Promise<ReviewQueueItem> {
    return this.transition(principal, id, 'Approved', notes, correlationId, async (tx, item) => {
      // Approving an email flips its sender_trust_state to Approved so it
      // enters the normal index path.
      await new mssql.Request(tx)
        .input('email_id', mssql.Char(26), item.emailId)
        .query(
          `UPDATE email SET sender_trust_state = 'Approved' WHERE id = @email_id;`,
        );
    });
  }

  async reject(
    principal: Principal,
    id: string,
    notes: string | null,
    correlationId: string,
  ): Promise<ReviewQueueItem> {
    return this.transition(principal, id, 'Rejected', notes, correlationId, async (tx, item) => {
      // Rejected → email is excluded from indexing but original is retained
      // (Non-Negotiable #3). We mark the email Unapproved.
      await new mssql.Request(tx)
        .input('email_id', mssql.Char(26), item.emailId)
        .query(
          `UPDATE email SET sender_trust_state = 'Unapproved' WHERE id = @email_id;`,
        );
    });
  }

  async markActioned(
    principal: Principal,
    id: string,
    notes: string | null,
    correlationId: string,
  ): Promise<ReviewQueueItem> {
    return this.transition(principal, id, 'Actioned', notes, correlationId);
  }

  private async transition(
    principal: Principal,
    id: string,
    targetState: 'Approved' | 'Rejected' | 'Actioned',
    notes: string | null,
    correlationId: string,
    sideEffect?: (tx: mssql.Transaction, item: ReviewQueueItem) => Promise<void>,
  ): Promise<ReviewQueueItem> {
    const existing = await this.get(id);
    if (!existing) throw new NotFoundError('Review queue item not found');
    if (existing.state !== 'Pending') {
      throw new ConflictError(
        `Review queue item already in state ${existing.state}`,
        { id, state: existing.state },
      );
    }

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('state', mssql.VarChar(16), targetState)
        .input('resolved_at', mssql.DateTimeOffset, utcNow())
        .input('resolved_by_user_id', mssql.Char(26), principal.userId)
        .input('notes', mssql.NVarChar(2000), notes)
        .query(`
          UPDATE email_review_queue_item
             SET state = @state, resolved_at = @resolved_at,
                 resolved_by_user_id = @resolved_by_user_id,
                 resolution_notes = @notes
           WHERE id = @id AND state = 'Pending';
        `);

      if (sideEffect) await sideEffect(tx, existing);

      const actionMap: Record<typeof targetState, AuditAction> = {
        Approved: 'email_review_queue.approve',
        Rejected: 'email_review_queue.reject',
        Actioned: 'email_review_queue.action',
      };
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: actionMap[targetState],
        entityType: 'EmailReviewQueueItem',
        entityId: id,
        before: { state: existing.state },
        after: { state: targetState, resolutionNotes: notes },
        correlationId,
      });

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const updated = await this.get(id);
    if (!updated) throw new Error('Review queue item disappeared after update');
    return updated;
  }
}
