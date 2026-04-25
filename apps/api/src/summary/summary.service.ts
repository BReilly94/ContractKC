import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import { QUEUES, type QueueClient } from '@ckb/queue';
import { ForbiddenError, NotFoundError, utcNow } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL, QUEUE_CLIENT } from '../common/tokens.js';

/**
 * Contract Summary (§5.4) + verification gate (Non-Negotiable #2).
 *
 * A summary is persisted by the summary-generate worker with
 * verification_state=Unverified. Only a Contract Owner can mark it Verified.
 * The Onboarding → Active transition check in ContractsService depends on
 * this state (already wired).
 */

export interface SummaryRow {
  readonly id: string;
  readonly contractId: string;
  readonly verificationState: 'Unverified' | 'Verified' | 'Superseded';
  readonly contentJson: Record<string, unknown> | null;
  readonly verifiedByUserId: string | null;
  readonly verifiedAt: Date | null;
  readonly generatedByCapabilityVersion: string | null;
  readonly generatedAt: Date | null;
}

interface DbRow {
  id: string;
  contract_id: string;
  verification_state: 'Unverified' | 'Verified' | 'Superseded';
  content_json: string | null;
  verified_by_user_id: string | null;
  verified_at: Date | null;
  generated_by_capability_version: string | null;
  generated_at: Date | null;
}

function mapRow(r: DbRow): SummaryRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    verificationState: r.verification_state,
    contentJson: r.content_json ? (JSON.parse(r.content_json) as Record<string, unknown>) : null,
    verifiedByUserId: r.verified_by_user_id,
    verifiedAt: r.verified_at,
    generatedByCapabilityVersion: r.generated_by_capability_version,
    generatedAt: r.generated_at,
  };
}

@Injectable()
export class SummaryService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  async getForContract(contractId: string): Promise<SummaryRow | null> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`
        SELECT cs.id, cs.contract_id, cs.verification_state, cs.content_json,
               cs.verified_by_user_id, cs.verified_at,
               cs.generated_by_capability_version, cs.generated_at
          FROM contract_summary cs
          JOIN contract c ON c.id = cs.contract_id
         WHERE cs.contract_id = @contract_id AND c.summary_id = cs.id
      `);
    const row = r.recordset[0];
    return row ? mapRow(row) : null;
  }

  async enqueueGeneration(
    principal: Principal,
    contractId: string,
    correlationId: string,
  ): Promise<{ queued: true }> {
    // Only users with contract access can trigger generation. Role check
    // happens at the controller layer (Owner / Administrator / Contributor).
    await this.queue.enqueue(
      QUEUES.summaryGenerate,
      { contractId, triggeredByUserId: principal.userId },
      { jobId: `summary_${contractId}_${Date.now()}` },
    );
    void correlationId;
    return { queued: true };
  }

  async verify(
    principal: Principal,
    contractId: string,
    role: 'Owner' | 'Administrator' | 'Contributor' | 'Viewer' | 'RestrictedViewer',
    correlationId: string,
  ): Promise<SummaryRow> {
    if (role !== 'Owner') {
      // HUMAN GATE (review-gates.md §1): only Contract Owner can verify.
      throw new ForbiddenError(
        'Only the Contract Owner can verify the contract summary (Non-Negotiable #2)',
      );
    }
    const current = await this.getForContract(contractId);
    if (!current) throw new NotFoundError('Summary not found — generate first');
    if (!current.contentJson) {
      throw new NotFoundError('Summary has no content — generate first');
    }

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), current.id)
        .input('verified_by_user_id', mssql.Char(26), principal.userId)
        .input('verified_at', mssql.DateTimeOffset, utcNow())
        .query(`
          UPDATE contract_summary
             SET verification_state = 'Verified',
                 verified_by_user_id = @verified_by_user_id,
                 verified_at = @verified_at
           WHERE id = @id AND verification_state = 'Unverified';
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contract_summary.verify',
        entityType: 'ContractSummary',
        entityId: current.id,
        before: { verificationState: current.verificationState },
        after: { verificationState: 'Verified' },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const updated = await this.getForContract(contractId);
    if (!updated) throw new Error('Summary disappeared after verify');
    return updated;
  }
}
