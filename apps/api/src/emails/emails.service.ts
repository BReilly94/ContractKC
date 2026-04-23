import type { StorageClient } from '@ckb/storage';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL, STORAGE_CLIENT } from '../common/tokens.js';

export interface EmailListRow {
  readonly id: string;
  readonly contractId: string;
  readonly threadId: string | null;
  readonly rfcMessageId: string;
  readonly fromAddress: string;
  readonly fromName: string | null;
  readonly subject: string;
  readonly receivedAt: Date;
  readonly sentAt: Date | null;
  readonly senderTrustState: string;
  readonly direction: string;
  readonly privilegedFlag: boolean;
  readonly duplicateOfEmailId: string | null;
  readonly containsSharedLink: boolean;
}

export interface EmailDetailRow extends EmailListRow {
  readonly inReplyTo: string | null;
  readonly referencesRaw: string | null;
  readonly toAddresses: readonly string[];
  readonly ccAddresses: readonly string[];
  readonly bccAddresses: readonly string[];
  readonly bodyText: string | null;
  readonly rawEmlSha256: string;
  readonly rawEmlBlobPath: string;
  readonly attachments: readonly AttachmentRef[];
}

export interface AttachmentRef {
  readonly documentId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly malwareScanStatus: string;
}

interface DbEmailRow {
  id: string;
  contract_id: string;
  thread_id: string | null;
  rfc_message_id: string;
  in_reply_to: string | null;
  references_raw: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  subject: string;
  sent_at: Date | null;
  received_at: Date;
  body_text: string | null;
  raw_eml_sha256: string;
  raw_eml_blob_path: string;
  sender_trust_state: string;
  direction: string;
  privileged_flag: boolean | number;
  contains_shared_link: boolean | number;
  duplicate_of_email_id: string | null;
}

function parseArray(raw: string | null): readonly string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // fall through
  }
  return [];
}

function mapList(r: DbEmailRow): EmailListRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    threadId: r.thread_id,
    rfcMessageId: r.rfc_message_id,
    fromAddress: r.from_address,
    fromName: r.from_name,
    subject: r.subject,
    receivedAt: r.received_at,
    sentAt: r.sent_at,
    senderTrustState: r.sender_trust_state,
    direction: r.direction,
    privilegedFlag: Boolean(r.privileged_flag),
    duplicateOfEmailId: r.duplicate_of_email_id,
    containsSharedLink: Boolean(r.contains_shared_link),
  };
}

const EMAIL_LIST_SELECT = `
  SELECT id, contract_id, thread_id, rfc_message_id, in_reply_to, references_raw,
         from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
         subject, sent_at, received_at, body_text, raw_eml_sha256, raw_eml_blob_path,
         sender_trust_state, direction, privileged_flag, contains_shared_link,
         duplicate_of_email_id
    FROM email
`;

@Injectable()
export class EmailsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
  ) {}

  async listForContract(
    contractId: string,
    options: {
      includeDuplicates?: boolean;
      senderTrustState?: 'Approved' | 'ReviewQueue' | 'Unapproved';
    } = {},
  ): Promise<EmailListRow[]> {
    const clauses: string[] = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (!options.includeDuplicates) clauses.push('duplicate_of_email_id IS NULL');
    if (options.senderTrustState) {
      clauses.push('sender_trust_state = @sender_trust_state');
      req.input('sender_trust_state', mssql.VarChar(16), options.senderTrustState);
    }
    const r = await req.query<DbEmailRow>(
      `${EMAIL_LIST_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY received_at DESC`,
    );
    return r.recordset.map(mapList);
  }

  async get(id: string): Promise<EmailDetailRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbEmailRow>(`${EMAIL_LIST_SELECT} WHERE id = @id`);
    const row = r.recordset[0];
    if (!row) return null;

    const atts = await this.pool
      .request()
      .input('source_email_id', mssql.Char(26), id)
      .query<{
        id: string;
        original_filename: string;
        mime_type: string;
        size_bytes: number | string;
        malware_scan_status: string;
      }>(`
        SELECT id, original_filename, mime_type, size_bytes, malware_scan_status
          FROM document WHERE source_email_id = @source_email_id
          ORDER BY uploaded_at
      `);

    const detail: EmailDetailRow = {
      ...mapList(row),
      inReplyTo: row.in_reply_to,
      referencesRaw: row.references_raw,
      toAddresses: parseArray(row.to_addresses),
      ccAddresses: parseArray(row.cc_addresses),
      bccAddresses: parseArray(row.bcc_addresses),
      bodyText: row.body_text,
      rawEmlSha256: row.raw_eml_sha256,
      rawEmlBlobPath: row.raw_eml_blob_path,
      attachments: atts.recordset.map((a) => ({
        documentId: a.id,
        filename: a.original_filename,
        mimeType: a.mime_type,
        sizeBytes: typeof a.size_bytes === 'string' ? Number(a.size_bytes) : a.size_bytes,
        malwareScanStatus: a.malware_scan_status,
      })),
    };
    return detail;
  }

  async downloadRawEml(id: string): Promise<{ bytes: Buffer; filename: string } | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<{ raw_eml_blob_path: string; subject: string }>(`
        SELECT raw_eml_blob_path, subject FROM email WHERE id = @id
      `);
    const row = r.recordset[0];
    if (!row) return null;
    const bytes = await this.storage.get(row.raw_eml_blob_path);
    const safeSubject = row.subject.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
    return { bytes, filename: `${id}-${safeSubject || 'email'}.eml` };
  }

  async listThread(threadId: string): Promise<EmailListRow[]> {
    const r = await this.pool
      .request()
      .input('thread_id', mssql.Char(26), threadId)
      .query<DbEmailRow>(
        `${EMAIL_LIST_SELECT} WHERE thread_id = @thread_id ORDER BY received_at ASC`,
      );
    return r.recordset.map(mapList);
  }

  async getContractIdForEmail(id: string): Promise<string | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<{ contract_id: string }>(`SELECT contract_id FROM email WHERE id = @id`);
    return r.recordset[0]?.contract_id ?? null;
  }

  async getContractIdForThread(threadId: string): Promise<string | null> {
    const r = await this.pool
      .request()
      .input('thread_id', mssql.Char(26), threadId)
      .query<{ contract_id: string }>(
        `SELECT contract_id FROM email_thread WHERE id = @thread_id`,
      );
    return r.recordset[0]?.contract_id ?? null;
  }
}
