import { logAudit, queryAuditLog } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type { AuditAction, AuditEntityType } from '@ckb/domain';
import { newUlid, utcNow } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { PassThrough } from 'node:stream';
import { DB_POOL } from '../common/tokens.js';

/**
 * Auditor export service (Slice JJ — §5.11 carry-forward).
 *
 * Streams audit_log rows matching the caller's filters as CSV. The hash
 * chain (prev_hash, row_hash) is included so an external auditor can
 * verify integrity end-to-end.
 */

export interface AuditExportFilters {
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly entityType?: AuditEntityType | undefined;
  readonly userId?: string | undefined;
  readonly action?: AuditAction | undefined;
}

@Injectable()
export class AuditExportService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async streamCsv(
    principal: Principal,
    filters: AuditExportFilters,
    correlationId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; filename: string; jobId: string }> {
    const jobId = newUlid();
    await this.insertJob(jobId, principal.userId, filters);
    await this.auditRequest(principal.userId, jobId, filters, correlationId);

    const filename = `ckb-audit-export-${jobId}.csv`;
    const out = new PassThrough();

    // Kick off write pipeline without blocking the response.
    void this.writeCsv(jobId, principal.userId, filters, out, correlationId).catch((err) => {
      out.destroy(err);
    });

    return { stream: out, filename, jobId };
  }

  private async writeCsv(
    jobId: string,
    userId: string,
    filters: AuditExportFilters,
    out: PassThrough,
    correlationId: string,
  ): Promise<void> {
    const header = [
      'sequence_number',
      'id',
      'actor_user_id',
      'action',
      'entity_type',
      'entity_id',
      'correlation_id',
      'created_at',
      'prev_hash',
      'row_hash',
      'before_json',
      'after_json',
    ].join(',');
    out.write(header + '\n');

    let rowCount = 0;
    // Page by sequence_number for stable, chain-ordered output.
    let cursor = 0;
    const pageSize = 500;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await queryAuditLog(this.pool, {
        ...(filters.entityType !== undefined ? { entityType: filters.entityType } : {}),
        ...(filters.action !== undefined ? { action: filters.action } : {}),
        fromSequence: cursor + 1,
        limit: pageSize,
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        // Apply remaining filters in JS: from/to on created_at and userId.
        if (filters.from && r.createdAt < filters.from) continue;
        if (filters.to && r.createdAt > filters.to) continue;
        if (filters.userId && r.actorUserId !== filters.userId) continue;
        out.write(
          [
            r.sequenceNumber,
            csvField(r.id),
            csvField(r.actorUserId),
            csvField(r.action),
            csvField(r.entityType),
            csvField(r.entityId),
            csvField(r.correlationId),
            csvField(r.createdAt.toISOString()),
            csvField(r.prevHash ?? ''),
            csvField(r.rowHash),
            csvField(r.beforeJson ?? ''),
            csvField(r.afterJson ?? ''),
          ].join(',') + '\n',
        );
        rowCount += 1;
      }
      cursor = rows[rows.length - 1]?.sequenceNumber ?? cursor;
      if (rows.length < pageSize) break;
    }
    out.end();
    await this.markSucceeded(jobId, rowCount);
    await this.auditComplete(userId, jobId, rowCount, correlationId);
  }

  private async insertJob(
    id: string,
    userId: string,
    filters: AuditExportFilters,
  ): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .input('requested_by_user_id', mssql.Char(26), userId)
      .input('from_at', mssql.DateTimeOffset, filters.from ?? null)
      .input('to_at', mssql.DateTimeOffset, filters.to ?? null)
      .input('entity_type_filter', mssql.VarChar(40), filters.entityType ?? null)
      .input('user_id_filter', mssql.Char(26), filters.userId ?? null)
      .input('action_filter', mssql.VarChar(64), filters.action ?? null)
      .query(`
        INSERT INTO audit_export_job
          (id, requested_by_user_id, from_at, to_at,
           entity_type_filter, user_id_filter, action_filter, state)
        VALUES
          (@id, @requested_by_user_id, @from_at, @to_at,
           @entity_type_filter, @user_id_filter, @action_filter, 'Pending');
      `);
  }

  private async markSucceeded(id: string, rowCount: number): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .input('row_count', mssql.Int, rowCount)
      .query(`
        UPDATE audit_export_job
           SET state = 'Succeeded',
               row_count = @row_count,
               completed_at = SYSDATETIMEOFFSET()
         WHERE id = @id;
      `);
  }

  private async auditRequest(
    userId: string,
    jobId: string,
    filters: AuditExportFilters,
    correlationId: string,
  ): Promise<void> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await logAudit(tx, {
        actorUserId: userId as unknown as Parameters<typeof logAudit>[1]['actorUserId'],
        action: 'audit.export.request',
        entityType: 'AuditExport',
        entityId: jobId,
        after: {
          from: filters.from?.toISOString() ?? null,
          to: filters.to?.toISOString() ?? null,
          entityType: filters.entityType ?? null,
          userId: filters.userId ?? null,
          action: filters.action ?? null,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  private async auditComplete(
    userId: string,
    jobId: string,
    rowCount: number,
    correlationId: string,
  ): Promise<void> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await logAudit(tx, {
        actorUserId: userId as unknown as Parameters<typeof logAudit>[1]['actorUserId'],
        action: 'audit.export.complete',
        entityType: 'AuditExport',
        entityId: jobId,
        after: { rowCount, completedAt: utcNow().toISOString() },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      // The CSV has been written; completing the audit is best-effort.
    }
  }
}

/**
 * CSV escape: wrap in quotes and double internal quotes. We keep the rule
 * simple and apply it to every text field — cheap, correct for RFC 4180.
 */
function csvField(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const s = value.replace(/"/g, '""');
  return `"${s}"`;
}
