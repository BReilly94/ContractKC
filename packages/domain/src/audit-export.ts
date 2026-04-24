import type { BrandedId } from '@ckb/shared';
import type { UserId } from './ids.js';
import type { AuditAction, AuditEntityType } from './audit.js';

/**
 * Auditor Export (Slice JJ, §5.11 carry-forward).
 *
 * Streams the append-only `audit_log` rows (hash chain intact) as CSV for
 * the `Auditor` global role. Each request is itself logged to the audit
 * chain, with `audit.export.request` before the stream opens and
 * `audit.export.complete` on success.
 */

export type AuditExportId = BrandedId<'AuditExport'>;

export interface AuditExportJob {
  readonly id: AuditExportId;
  readonly requestedByUserId: UserId;
  readonly from: Date | null;
  readonly to: Date | null;
  readonly entityType: AuditEntityType | null;
  readonly userId: UserId | null;
  readonly rowCount: number | null;
  readonly state: 'Pending' | 'Succeeded' | 'Failed';
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface AuditExportFilters {
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly entityType?: AuditEntityType | undefined;
  readonly userId?: UserId | undefined;
  readonly action?: AuditAction | undefined;
}
