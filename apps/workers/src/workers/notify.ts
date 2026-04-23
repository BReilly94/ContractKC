import { QUEUES } from '@ckb/queue';
import { getCorrelationId, newUlid, runWithCorrelation } from '@ckb/shared';
import mssql from 'mssql';
import nodemailer from 'nodemailer';
import { registerWorker, type WorkerContext } from '../registry.js';

/**
 * notify.v1 worker (§5.9). Single-event notification dispatch.
 *
 * Writes a row in `notification`, then (best-effort) emails via SMTP
 * (MailHog locally; Azure Communication Services in prod). The in-app
 * indicator is driven from the DB regardless of email success.
 *
 * ASSUMPTION: outbound mail is via SMTP to $SMTP_HOST:$SMTP_PORT
 * (MailHog on :1025 locally). Azure Communication Services Email plugs
 * in behind the same sendEmail helper.
 */

export interface NotifyPayload {
  readonly userId: string;
  readonly contractId: string | null;
  readonly kind:
    | 'review_queue_item'
    | 'deadline_due_soon'
    | 'deadline_missed'
    | 'summary_unverified'
    | 'document_quarantined'
    | 'query_blocked';
  readonly subject: string;
  readonly body: string | null;
  readonly linkPath: string | null;
  readonly sendEmail: boolean;
}

registerWorker<NotifyPayload>({
  queueName: QUEUES.notify,
  concurrency: 2,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => dispatch(payload, ctx));
  },
});

async function dispatch(payload: NotifyPayload, ctx: WorkerContext): Promise<void> {
  const { db, config, logger } = ctx;
  const id = newUlid();

  let emailSent = false;
  if (payload.sendEmail) {
    try {
      const userRow = await db
        .request()
        .input('id', mssql.Char(26), payload.userId)
        .query<{ email: string; display_name: string }>(
          `SELECT email, display_name FROM app_user WHERE id = @id`,
        );
      const user = userRow.recordset[0];
      if (user) {
        const transport = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: false,
          tls: { rejectUnauthorized: false },
        });
        await transport.sendMail({
          from: 'notifications@contracts.technicamining.com',
          to: user.email,
          subject: `[CKB] ${payload.subject}`,
          text: buildEmailText(payload, user.display_name),
        });
        emailSent = true;
      }
    } catch (err) {
      logger.warn('notify: email send failed (continuing with in-app only)', {
        reason: (err as Error).message,
      });
    }
  }

  await db
    .request()
    .input('id', mssql.Char(26), id)
    .input('user_id', mssql.Char(26), payload.userId)
    .input('contract_id', mssql.Char(26), payload.contractId)
    .input('kind', mssql.VarChar(40), payload.kind)
    .input('subject', mssql.NVarChar(512), payload.subject)
    .input('body', mssql.NVarChar(mssql.MAX), payload.body)
    .input('link_path', mssql.NVarChar(1024), payload.linkPath)
    .input('email_sent', mssql.Bit, emailSent ? 1 : 0)
    .input('email_sent_at', mssql.DateTimeOffset, emailSent ? new Date() : null)
    .query(`
      INSERT INTO notification
        (id, user_id, contract_id, kind, subject, body, link_path, email_sent, email_sent_at)
      VALUES
        (@id, @user_id, @contract_id, @kind, @subject, @body, @link_path, @email_sent, @email_sent_at);
    `);

  logger.info('notification dispatched', {
    userId: payload.userId,
    kind: payload.kind,
    emailSent,
  });
}

function buildEmailText(payload: NotifyPayload, displayName: string): string {
  const lines = [`Hi ${displayName},`, '', payload.subject];
  if (payload.body) {
    lines.push('', payload.body);
  }
  if (payload.linkPath) {
    lines.push('', `View: ${payload.linkPath}`);
  }
  lines.push('', '— Contract Knowledge Base');
  return lines.join('\n');
}
