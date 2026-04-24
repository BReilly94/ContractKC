import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

/**
 * Timeline View (SOW §3.10, §6.2, §8.7).
 *
 * Single chronological timeline across every Phase 2 entity. Read-only —
 * no new migration. Each row is pulled from the canonical table for that
 * kind of event; the union is done in SQL so pagination is cheap.
 *
 * Contract lifecycle transitions are recovered from `audit_log` by filtering
 * action='contract.lifecycle.transition'. Deadlines appear when they fire
 * (triggered_at) rather than every update; the register rows show their own
 * events.
 */

export type TimelineKind =
  | 'contract.lifecycle'
  | 'variation'
  | 'claim'
  | 'rfi'
  | 'submittal'
  | 'email'
  | 'document'
  | 'diary'
  | 'record_flag'
  | 'payment'
  | 'deadline.triggered'
  | 'interpretation'
  | 'notification';

export type TimelineSeverity = 'info' | 'warning' | 'critical';

export interface TimelineRow {
  readonly id: string;
  readonly contractId: string;
  readonly occurredAt: Date;
  readonly kind: TimelineKind;
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly severity: TimelineSeverity | null;
}

export interface TimelineListOptions {
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly kinds?: readonly TimelineKind[] | undefined;
  readonly limit: number;
  readonly cursor: string | null;
}

export interface TimelineListResult {
  readonly items: readonly TimelineRow[];
  readonly nextCursor: string | null;
}

const ALL_KINDS: readonly TimelineKind[] = [
  'contract.lifecycle',
  'variation',
  'claim',
  'rfi',
  'submittal',
  'email',
  'document',
  'diary',
  'record_flag',
  'payment',
  'deadline.triggered',
  'interpretation',
  'notification',
];

interface DbRow {
  id: string;
  contract_id: string;
  occurred_at: Date;
  kind: TimelineKind;
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  severity: TimelineSeverity | null;
}

@Injectable()
export class TimelineService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listForContract(
    contractId: string,
    options: TimelineListOptions,
  ): Promise<TimelineListResult> {
    const kinds = options.kinds && options.kinds.length > 0
      ? options.kinds.filter((k) => ALL_KINDS.includes(k))
      : ALL_KINDS;
    const kindSet = new Set(kinds);

    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (options.from) req.input('from_at', mssql.DateTimeOffset, options.from);
    if (options.to) req.input('to_at', mssql.DateTimeOffset, options.to);

    // Cursor encoding: base64url of `${iso_occurred_at}|${id}`. We paginate
    // strictly by (occurred_at DESC, id DESC) so ties are deterministic.
    let cursorOccurredAt: Date | null = null;
    let cursorId: string | null = null;
    if (options.cursor) {
      try {
        const decoded = Buffer.from(options.cursor, 'base64url').toString('utf8');
        const [iso, id] = decoded.split('|');
        if (iso && id) {
          cursorOccurredAt = new Date(iso);
          cursorId = id;
        }
      } catch {
        // Bad cursor → ignore; caller can start over.
      }
    }
    if (cursorOccurredAt && cursorId) {
      req.input('cursor_at', mssql.DateTimeOffset, cursorOccurredAt);
      req.input('cursor_id', mssql.Char(26), cursorId);
    }

    const subqueries: string[] = [];
    if (kindSet.has('contract.lifecycle')) {
      subqueries.push(`
        SELECT id, entity_id AS contract_id, created_at AS occurred_at,
               'contract.lifecycle' AS kind,
               'Contract' AS entity_type,
               entity_id,
               CAST('Contract lifecycle transition' AS NVARCHAR(512)) AS title,
               CAST(action AS NVARCHAR(512)) AS subtitle,
               CAST('info' AS VARCHAR(16)) AS severity
          FROM audit_log
         WHERE action = 'contract.lifecycle.transition'
           AND entity_type = 'Contract'
           AND entity_id = @contract_id
      `);
    }
    if (kindSet.has('variation')) {
      subqueries.push(`
        SELECT id, contract_id, created_at AS occurred_at,
               'variation' AS kind, 'Variation' AS entity_type, id AS entity_id,
               CAST(title AS NVARCHAR(512)) AS title,
               CAST(lifecycle_state AS NVARCHAR(512)) AS subtitle,
               CAST('info' AS VARCHAR(16)) AS severity
          FROM variation
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('claim')) {
      subqueries.push(`
        SELECT id, contract_id, created_at AS occurred_at,
               'claim' AS kind, 'Claim' AS entity_type, id AS entity_id,
               CAST(title AS NVARCHAR(512)) AS title,
               CAST(lifecycle_state AS NVARCHAR(512)) AS subtitle,
               CAST(CASE WHEN lifecycle_state LIKE 'Resolved%'
                         THEN 'warning' ELSE 'info' END AS VARCHAR(16)) AS severity
          FROM claim
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('rfi')) {
      subqueries.push(`
        SELECT id, contract_id, created_at AS occurred_at,
               'rfi' AS kind, 'Rfi' AS entity_type, id AS entity_id,
               CAST(subject AS NVARCHAR(512)) AS title,
               CAST(lifecycle_state AS NVARCHAR(512)) AS subtitle,
               CAST('info' AS VARCHAR(16)) AS severity
          FROM rfi
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('submittal')) {
      subqueries.push(`
        SELECT id, contract_id, created_at AS occurred_at,
               'submittal' AS kind, 'Submittal' AS entity_type, id AS entity_id,
               CAST(title AS NVARCHAR(512)) AS title,
               CAST(lifecycle_state AS NVARCHAR(512)) AS subtitle,
               CAST('info' AS VARCHAR(16)) AS severity
          FROM submittal
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('email')) {
      subqueries.push(`
        SELECT id, contract_id, received_at AS occurred_at,
               'email' AS kind, 'Email' AS entity_type, id AS entity_id,
               CAST(subject AS NVARCHAR(512)) AS title,
               CAST(from_address AS NVARCHAR(512)) AS subtitle,
               CAST('info' AS VARCHAR(16)) AS severity
          FROM email
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('document')) {
      subqueries.push(`
        SELECT id, contract_id, uploaded_at AS occurred_at,
               'document' AS kind, 'Document' AS entity_type, id AS entity_id,
               CAST(original_filename AS NVARCHAR(512)) AS title,
               CAST(category AS NVARCHAR(512)) AS subtitle,
               CAST(CASE WHEN malware_scan_status = 'Quarantined'
                         THEN 'critical' ELSE 'info' END AS VARCHAR(16)) AS severity
          FROM document
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('diary')) {
      subqueries.push(`
        SELECT id, contract_id, occurred_at,
               'diary' AS kind, 'SiteDiaryEntry' AS entity_type, id AS entity_id,
               CAST(COALESCE(weather, 'Diary entry') AS NVARCHAR(512)) AS title,
               CAST(LEFT(ISNULL(free_narrative, ''), 256) AS NVARCHAR(512)) AS subtitle,
               CAST('info' AS VARCHAR(16)) AS severity
          FROM site_diary_entry
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('record_flag')) {
      subqueries.push(`
        SELECT id, contract_id, created_at AS occurred_at,
               'record_flag' AS kind, 'RecordFlag' AS entity_type, id AS entity_id,
               CAST(flag_type AS NVARCHAR(512)) AS title,
               CAST(COALESCE(hold_point_name, target_type) AS NVARCHAR(512)) AS subtitle,
               CAST(CASE WHEN severity = 'Critical' THEN 'critical'
                         WHEN severity = 'High'     THEN 'warning'
                         ELSE 'info' END AS VARCHAR(16)) AS severity
          FROM record_flag
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('payment')) {
      subqueries.push(`
        SELECT id, contract_id, created_at AS occurred_at,
               'payment' AS kind, 'PaymentApplication' AS entity_type, id AS entity_id,
               CAST(CONCAT('Payment Application #', ISNULL(application_number, 0)) AS NVARCHAR(512)) AS title,
               CAST(status AS NVARCHAR(512)) AS subtitle,
               CAST(CASE WHEN status = 'Disputed' THEN 'warning' ELSE 'info' END AS VARCHAR(16)) AS severity
          FROM payment_application
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('deadline.triggered')) {
      subqueries.push(`
        SELECT id, contract_id, triggered_at AS occurred_at,
               'deadline.triggered' AS kind, 'Deadline' AS entity_type, id AS entity_id,
               CAST(label AS NVARCHAR(512)) AS title,
               CAST(CONCAT('State=', lifecycle_state) AS NVARCHAR(512)) AS subtitle,
               CAST(CASE WHEN lifecycle_state = 'Missed' THEN 'critical'
                         WHEN lifecycle_state = 'Triggered' THEN 'warning'
                         ELSE 'info' END AS VARCHAR(16)) AS severity
          FROM deadline
         WHERE contract_id = @contract_id AND triggered_at IS NOT NULL
      `);
    }
    if (kindSet.has('interpretation')) {
      subqueries.push(`
        SELECT id, contract_id,
               CAST(decided_at AS DATETIMEOFFSET) AS occurred_at,
               'interpretation' AS kind, 'Interpretation' AS entity_type, id AS entity_id,
               CAST(title AS NVARCHAR(512)) AS title,
               CAST(NULL AS NVARCHAR(512)) AS subtitle,
               CAST('info' AS VARCHAR(16)) AS severity
          FROM interpretation
         WHERE contract_id = @contract_id
      `);
    }
    if (kindSet.has('notification')) {
      subqueries.push(`
        SELECT id, contract_id, created_at AS occurred_at,
               'notification' AS kind, 'Notification' AS entity_type, id AS entity_id,
               CAST(subject AS NVARCHAR(512)) AS title,
               CAST(kind AS NVARCHAR(512)) AS subtitle,
               CAST(CASE WHEN kind IN ('deadline_missed','document_quarantined','query_blocked')
                         THEN 'critical' ELSE 'info' END AS VARCHAR(16)) AS severity
          FROM notification
         WHERE contract_id = @contract_id
      `);
    }

    if (subqueries.length === 0) {
      return { items: [], nextCursor: null };
    }

    const filters: string[] = [];
    if (options.from) filters.push('occurred_at >= @from_at');
    if (options.to)   filters.push('occurred_at <= @to_at');
    if (cursorOccurredAt && cursorId) {
      filters.push('(occurred_at < @cursor_at OR (occurred_at = @cursor_at AND id < @cursor_id))');
    }
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const limit = Math.min(Math.max(options.limit, 1), 200);
    // Pull `limit + 1` rows to detect whether a next cursor exists.
    const sql = `
      WITH tl AS (
        ${subqueries.join('\n        UNION ALL\n        ')}
      )
      SELECT TOP (${limit + 1})
             id, contract_id, occurred_at, kind, entity_type, entity_id,
             title, subtitle, severity
        FROM tl
        ${whereClause}
        ORDER BY occurred_at DESC, id DESC
    `;

    const r = await req.query<DbRow>(sql);
    const rows = r.recordset.map((row): TimelineRow => ({
      id: row.id,
      contractId: row.contract_id,
      occurredAt: row.occurred_at,
      kind: row.kind,
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: row.title,
      subtitle: row.subtitle,
      severity: row.severity,
    }));

    let nextCursor: string | null = null;
    let items: readonly TimelineRow[] = rows;
    if (rows.length > limit) {
      items = rows.slice(0, limit);
      const last = items[items.length - 1];
      if (last) {
        const raw = `${last.occurredAt.toISOString()}|${last.id}`;
        nextCursor = Buffer.from(raw, 'utf8').toString('base64url');
      }
    }
    return { items, nextCursor };
  }
}

export { ALL_KINDS as TIMELINE_ALL_KINDS };
