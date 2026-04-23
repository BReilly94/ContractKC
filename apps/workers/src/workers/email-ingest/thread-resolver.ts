import { newUlid, utcNow } from '@ckb/shared';
import mssql from 'mssql';
import { normalizeSubject } from '@ckb/domain';

/**
 * Thread reconstruction (`email-ingestion.md` §7.5).
 *
 * 1. In-Reply-To → emails in same contract with matching rfc_message_id. Hit → join.
 * 2. For each References header (newest → oldest), look up in same contract.
 *    First hit → join that thread.
 * 3. Otherwise create a new thread rooted at this email.
 *
 * Cross-contract threading is explicitly refused (Non-Negotiable #6).
 */

export async function resolveOrCreateThread(
  tx: mssql.Transaction,
  contractId: string,
  params: {
    subject: string;
    inReplyTo: string | null;
    references: readonly string[];
    sentAt: Date | null;
  },
): Promise<string> {
  const candidateMessageIds: string[] = [];
  if (params.inReplyTo) candidateMessageIds.push(params.inReplyTo);
  for (let i = params.references.length - 1; i >= 0; i -= 1) {
    const ref = params.references[i];
    if (ref && !candidateMessageIds.includes(ref)) candidateMessageIds.push(ref);
  }

  for (const mid of candidateMessageIds) {
    const r = await new mssql.Request(tx)
      .input('contract_id', mssql.Char(26), contractId)
      .input('message_id', mssql.VarChar(512), mid)
      .query<{ thread_id: string | null }>(
        `SELECT TOP 1 thread_id FROM email
          WHERE contract_id = @contract_id AND rfc_message_id = @message_id`,
      );
    const threadId = r.recordset[0]?.thread_id;
    if (threadId) return threadId;
  }

  // No match → new thread.
  const threadId = newUlid();
  await new mssql.Request(tx)
    .input('id', mssql.Char(26), threadId)
    .input('contract_id', mssql.Char(26), contractId)
    .input('subject_normalized', mssql.NVarChar(512), normalizeSubject(params.subject).slice(0, 512))
    .input('last_activity_at', mssql.DateTimeOffset, params.sentAt ?? utcNow())
    .query(`
      INSERT INTO email_thread (id, contract_id, subject_normalized, last_activity_at)
      VALUES (@id, @contract_id, @subject_normalized, @last_activity_at);
    `);
  return threadId;
}

export async function touchThreadActivity(
  tx: mssql.Transaction,
  threadId: string,
  at: Date,
): Promise<void> {
  await new mssql.Request(tx)
    .input('id', mssql.Char(26), threadId)
    .input('last_activity_at', mssql.DateTimeOffset, at)
    .query(
      `UPDATE email_thread SET last_activity_at = @last_activity_at WHERE id = @id
       AND (last_activity_at IS NULL OR last_activity_at < @last_activity_at)`,
    );
}
