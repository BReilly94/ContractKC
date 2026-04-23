import { logAudit } from '@ckb/audit';
import {
  asBrandedId,
  contentAddressedPath,
  getCorrelationId,
  newUlid,
  runWithCorrelation,
  utcNow,
} from '@ckb/shared';
import { QUEUES } from '@ckb/queue';
import mssql from 'mssql';
import { registerWorker, type WorkerContext } from '../../registry.js';
import { resolveRecipientsToContracts } from './alias-resolver.js';
import { parseEml, type ParsedAttachment, type ParsedEmail } from './parse.js';
import { resolveOrCreateThread, touchThreadActivity } from './thread-resolver.js';
import { checkSenderTrust } from './sender-trust.js';
import { detectSharedLinks } from './shared-links.js';
import { parseIcs } from './ics-parse.js';

/**
 * Worker for queue `email.ingest.v1`.
 *
 * Stages (`email-ingestion.md` §7):
 *   1. Mark the inbound_email_event Processing.
 *   2. Fetch raw bytes from blob storage.
 *   3. Parse MIME.
 *   4. Resolve envelope recipients → contract ids (one email per contract).
 *   5. For each contract:
 *        a. Upsert inbound_email_event if cloning to a second contract.
 *        b. Check duplicates (same contract, same message-id OR same sha256).
 *        c. Resolve/create thread.
 *        d. Check sender trust.
 *        e. Insert email row.
 *        f. Persist attachments → documents, enqueue malware scan + OCR.
 *        g. Parse any .ics attachments → calendar_event.
 *        h. Detect shared-link URLs → shared_link_capture.
 *        i. If trust state ≠ Approved → create review queue item.
 *        j. Enqueue email-prescreen capability (privileged check).
 *        k. Enqueue retrieval.embed-index for indexing.
 *        l. Audit.
 *   6. Mark inbound_email_event Succeeded (or Failed with reason).
 *
 * Non-Negotiables enforced here:
 *   - #3: original .eml is never re-written; all derived rows reference the
 *     already-stored blob by path.
 *   - #4: every state change audits.
 *   - #6: thread joins are always contract-scoped.
 */

export interface EmailIngestPayload {
  readonly inboundEventId: string;
  readonly rawEmlSha256: string;
  readonly blobPath: string;
  readonly envelopeTo: readonly string[];
  readonly envelopeFrom: string;
  readonly provider: 'SendGrid' | 'LocalFolderWatcher' | 'AzureNative';
  readonly source: string;
}

// The system-level user that the worker attributes mail-ingestion events to.
// In a production cutover we can add a dedicated `contracts.technicamining.com`
// service principal; for now we pick the first admin user at startup.
const SYSTEM_INGESTION_USER_ID_CACHE_KEY = Symbol.for('ckb.system.ingestion.user.id');

async function resolveSystemUserId(pool: mssql.ConnectionPool): Promise<string> {
  const cache = globalThis as unknown as Record<symbol, string | undefined>;
  if (cache[SYSTEM_INGESTION_USER_ID_CACHE_KEY]) return cache[SYSTEM_INGESTION_USER_ID_CACHE_KEY]!;
  const r = await pool.request().query<{ id: string }>(
    `SELECT TOP 1 id FROM app_user WHERE global_role IN ('SystemAdministrator','KnowledgeCentreAdministrator') ORDER BY created_at ASC`,
  );
  const id = r.recordset[0]?.id;
  if (!id) {
    throw new Error(
      'No SystemAdministrator/KnowledgeCentreAdministrator user exists — required for ingestion audit attribution',
    );
  }
  cache[SYSTEM_INGESTION_USER_ID_CACHE_KEY] = id;
  return id;
}

registerWorker<EmailIngestPayload>({
  queueName: QUEUES.emailIngest,
  concurrency: 2,
  async handle(payload, ctx) {
    const correlationId = getCorrelationId() ?? newUlid();
    await runWithCorrelation(correlationId, () => processIngest(payload, ctx));
  },
});

async function processIngest(
  payload: EmailIngestPayload,
  ctx: WorkerContext,
): Promise<void> {
  const { logger, db, clients, config } = ctx;
  const systemUserId = await resolveSystemUserId(db);

  logger.info('email ingest start', {
    inboundEventId: payload.inboundEventId,
    rawEmlSha256: payload.rawEmlSha256,
    envelopeTo: payload.envelopeTo,
  });

  // Ensure inbound_email_event row exists; the ingestion webhook/folder-watcher
  // is thin and may have skipped DB writes. We upsert.
  await upsertInboundEvent(db, payload, 'Processing');

  try {
    const rawBytes = await clients.storage.get(payload.blobPath);
    const parsed = await parseEml(rawBytes);

    const matches = await resolveRecipientsToContracts(db, [
      ...payload.envelopeTo,
      ...parsed.to,
      ...parsed.cc,
    ]);

    if (matches.length === 0) {
      await markEventFailed(db, payload.inboundEventId, 'no_alias_match');
      logger.warn('no contract alias matched envelope recipients', {
        envelopeTo: payload.envelopeTo,
      });
      return;
    }

    let firstResultingEmailId: string | null = null;

    for (const match of matches) {
      const resultEmailId = await ingestIntoContract({
        contractId: match.contractId,
        payload,
        parsed,
        ctx,
        systemUserId,
        correlationId: getCorrelationId() ?? newUlid(),
      });
      if (resultEmailId && !firstResultingEmailId) firstResultingEmailId = resultEmailId;
    }

    await markEventSucceeded(db, payload.inboundEventId, firstResultingEmailId);
    logger.info('email ingest succeeded', {
      inboundEventId: payload.inboundEventId,
      contractCount: matches.length,
    });

    // ASSUMPTION: while we build Slice F's email-prescreen capability, the
    // prescreen enqueue is a no-op. Slice F replaces this with a real capability.
    void config;
  } catch (err) {
    const message = (err as Error).message;
    await markEventFailed(db, payload.inboundEventId, message);
    logger.error('email ingest failed', {
      inboundEventId: payload.inboundEventId,
      reason: message,
    });
    throw err;
  }
}

interface IngestIntoContractArgs {
  contractId: string;
  payload: EmailIngestPayload;
  parsed: ParsedEmail;
  ctx: WorkerContext;
  systemUserId: string;
  correlationId: string;
}

async function ingestIntoContract(args: IngestIntoContractArgs): Promise<string | null> {
  const { contractId, parsed, ctx, payload, systemUserId, correlationId } = args;
  const { db, clients } = ctx;

  const existingDup = await findDuplicate(db, contractId, parsed.messageId, payload.rawEmlSha256);
  if (existingDup) {
    ctx.logger.info('duplicate email detected — not re-ingesting', {
      contractId,
      existingEmailId: existingDup,
    });
    // Record a duplicate-tagged row so the audit captures the arrival.
    // For Phase 1 we simply log the duplicate via audit; we do NOT create a
    // second email row — the original retains the canonical record.
    const tx = new mssql.Transaction(db);
    await tx.begin();
    try {
      await logAudit(tx, {
        actorUserId: asBrandedId<'User'>(systemUserId),
        action: 'email.ingest.duplicate',
        entityType: 'Email',
        entityId: existingDup,
        after: { rawEmlSha256: payload.rawEmlSha256, source: payload.source },
        correlationId,
      });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    return existingDup;
  }

  const tx = new mssql.Transaction(db);
  await tx.begin(mssql.ISOLATION_LEVEL.READ_COMMITTED);
  const emailId = newUlid();
  try {
    const threadId = await resolveOrCreateThread(tx, contractId, {
      subject: parsed.subject,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      sentAt: parsed.date,
    });

    const trustState = await checkSenderTrust(tx, contractId, parsed.from);
    const sharedLinks = detectSharedLinks(
      `${parsed.textBody ?? ''}\n${parsed.htmlBody ?? ''}`,
    );
    const containsSharedLink = sharedLinks.length > 0;

    // Persist the email row.
    const receivedAt = utcNow();
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), emailId)
      .input('contract_id', mssql.Char(26), contractId)
      .input('rfc_message_id', mssql.VarChar(512), parsed.messageId || `<${emailId}@local>`)
      .input('in_reply_to', mssql.VarChar(512), parsed.inReplyTo)
      .input('references_raw', mssql.NVarChar(mssql.MAX), parsed.references.join(' '))
      .input('thread_id', mssql.Char(26), threadId)
      .input('from_address', mssql.VarChar(320), parsed.from)
      .input('from_name', mssql.NVarChar(256), parsed.fromName)
      .input('to_addresses', mssql.NVarChar(mssql.MAX), JSON.stringify(parsed.to))
      .input('cc_addresses', mssql.NVarChar(mssql.MAX), JSON.stringify(parsed.cc))
      .input('bcc_addresses', mssql.NVarChar(mssql.MAX), JSON.stringify(parsed.bcc))
      .input('subject', mssql.NVarChar(1024), parsed.subject.slice(0, 1024))
      .input('sent_at', mssql.DateTimeOffset, parsed.date)
      .input('received_at', mssql.DateTimeOffset, receivedAt)
      .input('body_text', mssql.NVarChar(mssql.MAX), parsed.textBody)
      .input('raw_eml_sha256', mssql.Char(64), payload.rawEmlSha256)
      .input('raw_eml_blob_path', mssql.VarChar(512), payload.blobPath)
      .input('sender_trust_state', mssql.VarChar(16), trustState)
      .input('contains_shared_link', mssql.Bit, containsSharedLink ? 1 : 0)
      .input('shared_link_status', mssql.VarChar(32), containsSharedLink ? 'ManualCapturePending' : 'NotApplicable')
      .query(`
        INSERT INTO email
          (id, contract_id, rfc_message_id, in_reply_to, references_raw, thread_id,
           direction, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
           subject, sent_at, received_at, body_text,
           raw_eml_sha256, raw_eml_blob_path, sender_trust_state,
           contains_shared_link, shared_link_status)
        VALUES
          (@id, @contract_id, @rfc_message_id, @in_reply_to, @references_raw, @thread_id,
           'Inbound', @from_address, @from_name, @to_addresses, @cc_addresses, @bcc_addresses,
           @subject, @sent_at, @received_at, @body_text,
           @raw_eml_sha256, @raw_eml_blob_path, @sender_trust_state,
           @contains_shared_link, @shared_link_status);
      `);

    // Attachments → documents.
    const attachmentJobs: Array<{ documentId: string; blobPath: string; sha256: string; size: number; mime: string }> = [];
    for (const att of parsed.attachments) {
      const attBlobPath = contentAddressedPath(att.sha256, 'raw');
      // Write attachment outside tx — storage isn't transactional. Idempotent via ifNoneMatch.
      await clients.storage.put(attBlobPath, att.bytes, {
        contentType: att.contentType,
        ifNoneMatch: '*',
      });
      const documentId = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), documentId)
        .input('contract_id', mssql.Char(26), contractId)
        .input('category', mssql.VarChar(40), 'Correspondence')
        .input('mime_type', mssql.VarChar(128), att.contentType)
        .input('original_filename', mssql.NVarChar(512), att.filename)
        .input('size_bytes', mssql.BigInt, att.bytes.length)
        .input('sha256', mssql.Char(64), att.sha256)
        .input('blob_path', mssql.VarChar(512), attBlobPath)
        .input('source', mssql.VarChar(24), 'EmailIngestion')
        .input('source_email_id', mssql.Char(26), emailId)
        .input('encryption_state', mssql.VarChar(24), att.encrypted ? 'EncryptedPending' : 'None')
        .query(`
          INSERT INTO document
            (id, contract_id, category, mime_type, original_filename, size_bytes,
             sha256, blob_path, source, source_email_id, encryption_state,
             malware_scan_status, ocr_status, redaction_state, is_superseded)
          VALUES
            (@id, @contract_id, @category, @mime_type, @original_filename, @size_bytes,
             @sha256, @blob_path, @source, @source_email_id, @encryption_state,
             'Pending', 'Pending', 'None', 0);
        `);
      await logAudit(tx, {
        actorUserId: asBrandedId<'User'>(systemUserId),
        action: 'document.upload',
        entityType: 'Document',
        entityId: documentId,
        after: {
          source: 'EmailIngestion',
          contractId,
          sourceEmailId: emailId,
          filename: att.filename,
          sha256: att.sha256,
          encrypted: att.encrypted,
        },
        correlationId,
      });

      attachmentJobs.push({
        documentId,
        blobPath: attBlobPath,
        sha256: att.sha256,
        size: att.bytes.length,
        mime: att.contentType,
      });

      // If encrypted, raise a review queue item immediately.
      if (att.encrypted) {
        await insertReviewItem(tx, {
          emailId,
          contractId,
          reason: 'PasswordProtectedAttachment',
          reasonDetail: `Attachment "${att.filename}" is password-protected. Authorized user must supply the password.`,
        });
      }

      // .ics attachment → calendar_event.
      if (att.contentType === 'text/calendar' || att.filename.toLowerCase().endsWith('.ics')) {
        const parsedIcs = parseIcs(att.bytes);
        if (parsedIcs) {
          const calendarEventId = newUlid();
          await new mssql.Request(tx)
            .input('id', mssql.Char(26), calendarEventId)
            .input('email_id', mssql.Char(26), emailId)
            .input('contract_id', mssql.Char(26), contractId)
            .input('ics_uid', mssql.VarChar(512), parsedIcs.uid.slice(0, 512))
            .input('summary', mssql.NVarChar(512), parsedIcs.summary?.slice(0, 512) ?? null)
            .input('description', mssql.NVarChar(mssql.MAX), parsedIcs.description)
            .input('starts_at', mssql.DateTimeOffset, parsedIcs.startsAt)
            .input('ends_at', mssql.DateTimeOffset, parsedIcs.endsAt)
            .input('organizer_email', mssql.VarChar(320), parsedIcs.organizerEmail)
            .input('location', mssql.NVarChar(512), parsedIcs.location)
            .input('sequence_number', mssql.Int, parsedIcs.sequence)
            .input('rrule_raw', mssql.NVarChar(1024), parsedIcs.rrule)
            .query(`
              INSERT INTO calendar_event
                (id, email_id, contract_id, ics_uid, summary, description,
                 starts_at, ends_at, organizer_email, location, sequence_number, rrule_raw)
              VALUES
                (@id, @email_id, @contract_id, @ics_uid, @summary, @description,
                 @starts_at, @ends_at, @organizer_email, @location, @sequence_number, @rrule_raw);
            `);
          await logAudit(tx, {
            actorUserId: asBrandedId<'User'>(systemUserId),
            action: 'calendar_event.create',
            entityType: 'CalendarEvent',
            entityId: calendarEventId,
            after: { emailId, contractId, uid: parsedIcs.uid, startsAt: parsedIcs.startsAt },
            correlationId,
          });
        }
      }
    }

    // Shared-link captures.
    for (const link of sharedLinks) {
      const id = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('email_id', mssql.Char(26), emailId)
        .input('provider', mssql.VarChar(24), link.provider)
        .input('url', mssql.NVarChar(2000), link.url)
        .input('capture_state', mssql.VarChar(32), 'ManualCapturePending')
        .query(`
          INSERT INTO shared_link_capture (id, email_id, provider, url, capture_state)
          VALUES (@id, @email_id, @provider, @url, @capture_state);
        `);
      await insertReviewItem(tx, {
        emailId,
        contractId,
        reason: 'SharedLinkPending',
        reasonDetail: `Shared link detected (${link.provider}): ${link.url}. Authorized user must capture manually.`,
      });
    }

    // Review queue for untrusted sender.
    if (trustState !== 'Approved') {
      await insertReviewItem(tx, {
        emailId,
        contractId,
        reason: 'UnapprovedSender',
        reasonDetail: `Sender ${parsed.from} is not on the contract's approved list.`,
      });
    }

    await touchThreadActivity(tx, threadId, parsed.date ?? receivedAt);

    await logAudit(tx, {
      actorUserId: asBrandedId<'User'>(systemUserId),
      action: 'email.ingest.accept',
      entityType: 'Email',
      entityId: emailId,
      after: {
        contractId,
        rfcMessageId: parsed.messageId,
        senderTrustState: trustState,
        attachmentCount: parsed.attachments.length,
        sharedLinks: sharedLinks.length,
      },
      correlationId,
    });

    await tx.commit();

    // Post-commit fan-out. Each queue call is outside the tx because the
    // queue isn't transactional — enqueue-after-commit is the right order.
    for (const job of attachmentJobs) {
      await clients.queue.enqueue(
        QUEUES.malwareScan,
        { documentId: job.documentId, blobPath: job.blobPath, sha256: job.sha256, sizeBytes: job.size },
        { jobId: `scan:${job.documentId}` },
      );
      await clients.queue.enqueue(
        QUEUES.ocr,
        { documentId: job.documentId, blobPath: job.blobPath, mimeType: job.mime, language: 'en' },
        { jobId: `ocr:${job.documentId}` },
      );
    }
    // Privileged-content prescreen & indexing enqueues happen regardless of
    // trust state — the prescreen capability informs review-queue promotion,
    // and indexing happens post-approval by the review-queue side-effect.
    await clients.queue.enqueue(
      QUEUES.emailPrescreen,
      { emailId, contractId },
      { jobId: `prescreen:${emailId}` },
    );
    if (trustState === 'Approved') {
      await clients.queue.enqueue(
        QUEUES.embedIndex,
        { emailId, contractId, kind: 'Email' },
        { jobId: `index:email:${emailId}` },
      );
    }

    return emailId;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function findDuplicate(
  pool: mssql.ConnectionPool,
  contractId: string,
  messageId: string,
  rawEmlSha256: string,
): Promise<string | null> {
  if (!messageId && !rawEmlSha256) return null;
  const r = await pool
    .request()
    .input('contract_id', mssql.Char(26), contractId)
    .input('message_id', mssql.VarChar(512), messageId)
    .input('raw_eml_sha256', mssql.Char(64), rawEmlSha256)
    .query<{ id: string }>(`
      SELECT TOP 1 id FROM email
       WHERE contract_id = @contract_id
         AND (rfc_message_id = @message_id OR raw_eml_sha256 = @raw_eml_sha256)
    `);
  return r.recordset[0]?.id ?? null;
}

async function insertReviewItem(
  tx: mssql.Transaction,
  args: {
    emailId: string;
    contractId: string;
    reason: string;
    reasonDetail: string;
  },
): Promise<void> {
  const id = newUlid();
  await new mssql.Request(tx)
    .input('id', mssql.Char(26), id)
    .input('email_id', mssql.Char(26), args.emailId)
    .input('contract_id', mssql.Char(26), args.contractId)
    .input('reason', mssql.VarChar(40), args.reason)
    .input('reason_detail', mssql.NVarChar(2000), args.reasonDetail)
    .query(`
      INSERT INTO email_review_queue_item
        (id, email_id, contract_id, reason, reason_detail, state)
      VALUES
        (@id, @email_id, @contract_id, @reason, @reason_detail, 'Pending');
    `);
}

async function upsertInboundEvent(
  pool: mssql.ConnectionPool,
  payload: EmailIngestPayload,
  status: 'Queued' | 'Processing' | 'Succeeded' | 'Failed' | 'DeadLettered',
): Promise<void> {
  await pool
    .request()
    .input('id', mssql.Char(26), payload.inboundEventId)
    .input('provider', mssql.VarChar(32), payload.provider)
    .input('worker_status', mssql.VarChar(24), status)
    .input('correlation_id', mssql.Char(26), getCorrelationId() ?? newUlid())
    .query(`
      IF NOT EXISTS (SELECT 1 FROM inbound_email_event WHERE id = @id)
      BEGIN
        INSERT INTO inbound_email_event
          (id, provider, worker_status, correlation_id, attempt_count)
        VALUES
          (@id, @provider, @worker_status, @correlation_id, 0);
      END
      ELSE
      BEGIN
        UPDATE inbound_email_event
           SET worker_status = @worker_status,
               attempt_count = attempt_count + 1
         WHERE id = @id;
      END
    `);
}

async function markEventSucceeded(
  pool: mssql.ConnectionPool,
  inboundEventId: string,
  resultingEmailId: string | null,
): Promise<void> {
  await pool
    .request()
    .input('id', mssql.Char(26), inboundEventId)
    .input('resulting_email_id', mssql.Char(26), resultingEmailId)
    .query(`
      UPDATE inbound_email_event
         SET worker_status = 'Succeeded',
             resulting_email_id = @resulting_email_id
       WHERE id = @id;
    `);
}

async function markEventFailed(
  pool: mssql.ConnectionPool,
  inboundEventId: string,
  reason: string,
): Promise<void> {
  await pool
    .request()
    .input('id', mssql.Char(26), inboundEventId)
    .input('reason', mssql.NVarChar(mssql.MAX), reason)
    .query(`
      UPDATE inbound_email_event
         SET worker_status = 'Failed', last_error = @reason
       WHERE id = @id;
    `);
}
