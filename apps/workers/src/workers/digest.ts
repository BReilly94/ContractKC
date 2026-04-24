import { logAudit } from '@ckb/audit';
import {
  ALL_DIGEST_CATEGORIES,
  isDigestDue,
  type DigestCategory,
  type DigestChannel,
  type DigestFrequency,
  type DigestPreference,
  type UserId,
} from '@ckb/domain';
import { QUEUES } from '@ckb/queue';
import {
  asBrandedId,
  getCorrelationId,
  newUlid,
  runWithCorrelation,
  utcNow,
} from '@ckb/shared';
import mssql from 'mssql';
import nodemailer from 'nodemailer';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * Configurable Notification Digest worker (Slice II — §6.23).
 *
 * Enqueue one tick payload (`{ scope: 'all' }`) from a scheduler (cron /
 * Azure Logic App) daily and/or weekly — the worker scans preferences,
 * decides who is due per their stored frequency, and dispatches a single
 * aggregated notification per user.
 *
 * Categories aggregated (default set):
 *  - upcoming_deadlines    — verified deadlines with due_at in next 7 / 30 days
 *  - pending_reviews       — email_review_queue rows in Pending state
 *  - new_flags             — record_flag rows created since last dispatch
 *  - claim_status_changes  — claim lifecycle transitions since last dispatch
 *  - contract_events       — contract.lifecycle.transition since last dispatch
 *
 * System defaults (Weekly / InApp / all categories) fire for users without
 * an explicit preference row, so nobody silently misses the digest.
 */

export interface DigestTickPayload {
  readonly scope: 'all';
  readonly frequency?: DigestFrequency;
}

interface DbPrefRow {
  id: string;
  user_id: string;
  contract_id: string | null;
  frequency: DigestFrequency;
  channels: string;
  categories: string;
  last_dispatched_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

registerWorker<DigestTickPayload>({
  queueName: QUEUES.digest,
  concurrency: 1,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => dispatchDigests(payload, ctx));
  },
});

async function dispatchDigests(
  payload: DigestTickPayload,
  ctx: WorkerContext,
): Promise<void> {
  const { db, logger } = ctx;
  logger.info('digest tick received', { scope: payload.scope });

  // Collect all users who have contract access (we only digest for
  // active users). A left join against digest_preference gives us the
  // explicit preferences; null-coalesce to the system default per user.
  const users = await db.request().query<{
    user_id: string;
    email: string;
    display_name: string;
  }>(`
    SELECT DISTINCT u.id AS user_id, u.email, u.display_name
      FROM app_user u
      JOIN contract_access a ON a.user_id = u.id;
  `);

  for (const user of users.recordset) {
    try {
      await dispatchForUser(
        user.user_id,
        user.email,
        user.display_name,
        payload.frequency,
        ctx,
      );
    } catch (err) {
      logger.warn('digest: per-user failure (continuing)', {
        userId: user.user_id,
        reason: (err as Error).message,
      });
    }
  }
}

async function dispatchForUser(
  userId: string,
  email: string,
  displayName: string,
  forceFrequency: DigestFrequency | undefined,
  ctx: WorkerContext,
): Promise<void> {
  const { db, config, logger } = ctx;

  // Resolve preferences. A single aggregated digest per user — contract-
  // scope overrides are honoured when the worker scans per-contract
  // items, but the delivered notification is one per user.
  const prefsQ = await db
    .request()
    .input('user_id', mssql.Char(26), userId)
    .query<DbPrefRow>(`
      SELECT id, user_id, contract_id, frequency, channels, categories,
             last_dispatched_at, created_at, updated_at
        FROM digest_preference WHERE user_id = @user_id;
    `);
  const prefs: DigestPreference[] = prefsQ.recordset.map((r) => ({
    id: asBrandedId<'DigestPreference'>(r.id),
    userId: asBrandedId<'User'>(r.user_id),
    contractId: r.contract_id ? asBrandedId<'Contract'>(r.contract_id) : null,
    frequency: r.frequency,
    channels: JSON.parse(r.channels) as DigestChannel[],
    categories: JSON.parse(r.categories) as DigestCategory[],
    lastDispatchedAt: r.last_dispatched_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  // Effective user-wide preference. Contract-scoped rows apply only when
  // they scope a stricter rule for a specific contract; the aggregated
  // digest uses the wide row (or system default). This keeps the MVP
  // scope tractable — per-contract digests is Phase 3.
  const wide = prefs.find((p) => p.contractId === null);
  const effective: DigestPreference =
    wide ??
    ({
      id: asBrandedId<'DigestPreference'>('default-system'),
      userId: asBrandedId<'User'>(userId),
      contractId: null,
      frequency: 'Weekly',
      channels: ['InApp'],
      categories: ALL_DIGEST_CATEGORIES,
      lastDispatchedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DigestPreference);

  if (forceFrequency && effective.frequency !== forceFrequency) {
    return;
  }
  if (!isDigestDue(effective)) {
    return;
  }

  const since = effective.lastDispatchedAt ??
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const summary = await collectSummary(db, userId, effective.categories, since);

  if (summaryIsEmpty(summary)) {
    logger.info('digest: nothing to report for user, skipping', { userId });
    await stampLastDispatched(db, effective, userId);
    return;
  }

  const subject = buildSubject(summary);
  const body = buildBody(summary, displayName);
  const notificationId = newUlid();

  // Persist the in-app notification row (shared with §5.9 surface).
  await db
    .request()
    .input('id', mssql.Char(26), notificationId)
    .input('user_id', mssql.Char(26), userId)
    .input('subject', mssql.NVarChar(512), subject)
    .input('body', mssql.NVarChar(mssql.MAX), body)
    .query(`
      INSERT INTO notification
        (id, user_id, contract_id, kind, subject, body, link_path, email_sent)
      VALUES
        (@id, @user_id, NULL, 'digest_summary', @subject, @body, '/contracts', 0);
    `);

  let emailSent = false;
  if (effective.channels.includes('Email')) {
    try {
      const transport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: false,
        tls: { rejectUnauthorized: false },
      });
      await transport.sendMail({
        from: 'notifications@contracts.technicamining.com',
        to: email,
        subject: `[CKB] ${subject}`,
        text: `Hi ${displayName},\n\n${body}\n\n— Contract Knowledge Base`,
      });
      emailSent = true;
      await db
        .request()
        .input('id', mssql.Char(26), notificationId)
        .input('at', mssql.DateTimeOffset, utcNow())
        .query(
          `UPDATE notification SET email_sent = 1, email_sent_at = @at WHERE id = @id`,
        );
    } catch (err) {
      logger.warn('digest: email dispatch failed', {
        userId,
        reason: (err as Error).message,
      });
    }
  }

  // Audit the send + update lastDispatchedAt.
  await recordSend(db, userId, notificationId, effective.id, emailSent);
  await stampLastDispatched(db, effective, userId);
}

interface DigestSummary {
  upcomingDeadlines: Array<{ label: string; dueAt: string | null; contractName: string }>;
  pendingReviews: number;
  newFlags: number;
  claimStatusChanges: number;
  contractEvents: number;
}

function summaryIsEmpty(s: DigestSummary): boolean {
  return (
    s.upcomingDeadlines.length === 0 &&
    s.pendingReviews === 0 &&
    s.newFlags === 0 &&
    s.claimStatusChanges === 0 &&
    s.contractEvents === 0
  );
}

async function collectSummary(
  db: mssql.ConnectionPool,
  userId: string,
  categories: readonly DigestCategory[],
  since: Date,
): Promise<DigestSummary> {
  const summary: DigestSummary = {
    upcomingDeadlines: [],
    pendingReviews: 0,
    newFlags: 0,
    claimStatusChanges: 0,
    contractEvents: 0,
  };
  const contractsScope = `
    (SELECT contract_id FROM contract_access
      WHERE user_id = @user_id
        AND NOT EXISTS (
          SELECT 1 FROM contract_access_revocation r
           WHERE r.contract_id = contract_access.contract_id
             AND r.user_id = @user_id
             AND r.reversed_at IS NULL
        ))
  `;

  if (categories.includes('upcoming_deadlines')) {
    const r = await db
      .request()
      .input('user_id', mssql.Char(26), userId)
      .query<{ label: string; due_at: Date | null; contract_name: string }>(`
        SELECT TOP 25 d.label, d.due_at, c.name AS contract_name
          FROM deadline d
          JOIN contract c ON c.id = d.contract_id
         WHERE d.contract_id IN ${contractsScope}
           AND d.verification_state = 'Verified'
           AND d.lifecycle_state IN ('Active','Triggered')
           AND d.due_at IS NOT NULL
           AND d.due_at <= DATEADD(DAY, 30, SYSDATETIMEOFFSET())
         ORDER BY d.due_at ASC;
      `);
    summary.upcomingDeadlines = r.recordset.map((row) => ({
      label: row.label,
      dueAt: row.due_at ? row.due_at.toISOString() : null,
      contractName: row.contract_name,
    }));
  }

  if (categories.includes('pending_reviews')) {
    const r = await db
      .request()
      .input('user_id', mssql.Char(26), userId)
      .query<{ n: number }>(`
        SELECT COUNT(*) AS n
          FROM email_review_queue_item
         WHERE contract_id IN ${contractsScope} AND state = 'Pending';
      `);
    summary.pendingReviews = r.recordset[0]?.n ?? 0;
  }

  if (categories.includes('new_flags')) {
    const r = await db
      .request()
      .input('user_id', mssql.Char(26), userId)
      .input('since', mssql.DateTimeOffset, since)
      .query<{ n: number }>(`
        SELECT COUNT(*) AS n
          FROM record_flag
         WHERE contract_id IN ${contractsScope} AND created_at > @since;
      `);
    summary.newFlags = r.recordset[0]?.n ?? 0;
  }

  if (categories.includes('claim_status_changes')) {
    const r = await db
      .request()
      .input('user_id', mssql.Char(26), userId)
      .input('since', mssql.DateTimeOffset, since)
      .query<{ n: number }>(`
        SELECT COUNT(*) AS n
          FROM audit_log al
          JOIN claim c ON c.id = al.entity_id
         WHERE al.action = 'claim.lifecycle.transition'
           AND al.created_at > @since
           AND c.contract_id IN ${contractsScope};
      `);
    summary.claimStatusChanges = r.recordset[0]?.n ?? 0;
  }

  if (categories.includes('contract_events')) {
    const r = await db
      .request()
      .input('user_id', mssql.Char(26), userId)
      .input('since', mssql.DateTimeOffset, since)
      .query<{ n: number }>(`
        SELECT COUNT(*) AS n
          FROM audit_log
         WHERE action = 'contract.lifecycle.transition'
           AND created_at > @since
           AND entity_id IN ${contractsScope};
      `);
    summary.contractEvents = r.recordset[0]?.n ?? 0;
  }

  return summary;
}

function buildSubject(s: DigestSummary): string {
  const bits: string[] = [];
  if (s.upcomingDeadlines.length) bits.push(`${s.upcomingDeadlines.length} deadlines`);
  if (s.pendingReviews) bits.push(`${s.pendingReviews} reviews`);
  if (s.newFlags) bits.push(`${s.newFlags} flags`);
  if (s.claimStatusChanges) bits.push(`${s.claimStatusChanges} claim updates`);
  if (s.contractEvents) bits.push(`${s.contractEvents} contract events`);
  return `Digest — ${bits.join(', ')}`;
}

function buildBody(s: DigestSummary, displayName: string): string {
  const lines: string[] = [`Hi ${displayName},`, ''];
  if (s.upcomingDeadlines.length) {
    lines.push('Upcoming deadlines:');
    for (const d of s.upcomingDeadlines) {
      lines.push(`  • [${d.contractName}] ${d.label}${d.dueAt ? ` (due ${d.dueAt})` : ''}`);
    }
    lines.push('');
  }
  if (s.pendingReviews) lines.push(`Review queue items: ${s.pendingReviews}`);
  if (s.newFlags) lines.push(`New record flags: ${s.newFlags}`);
  if (s.claimStatusChanges) lines.push(`Claim status changes: ${s.claimStatusChanges}`);
  if (s.contractEvents) lines.push(`Contract events: ${s.contractEvents}`);
  return lines.join('\n');
}

async function stampLastDispatched(
  db: mssql.ConnectionPool,
  pref: DigestPreference,
  userId: string,
): Promise<void> {
  if (pref.id === ('default-system' as unknown)) return;
  await db
    .request()
    .input('id', mssql.Char(26), pref.id)
    .input('user_id', mssql.Char(26), userId)
    .input('at', mssql.DateTimeOffset, utcNow())
    .query(
      `UPDATE digest_preference SET last_dispatched_at = @at, updated_at = SYSDATETIMEOFFSET() WHERE id = @id AND user_id = @user_id`,
    );
}

async function recordSend(
  db: mssql.ConnectionPool,
  userId: string,
  notificationId: string,
  preferenceId: DigestPreference['id'],
  emailSent: boolean,
): Promise<void> {
  const tx = new mssql.Transaction(db);
  await tx.begin();
  try {
    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(userId) as UserId,
      action: 'digest.send',
      entityType: 'DigestPreference',
      entityId: String(preferenceId),
      after: { userId, notificationId, emailSent },
      correlationId: getCorrelationId() ?? newUlid(),
    });
    await tx.commit();
  } catch {
    await tx.rollback();
  }
}
