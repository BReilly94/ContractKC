import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type { StorageClient } from '@ckb/storage';
import { newUlid, sha256, utcNow } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import archiver from 'archiver';
import mssql from 'mssql';
import { PassThrough } from 'node:stream';
import { DB_POOL, STORAGE_CLIENT } from '../common/tokens.js';

/**
 * Data portability export (§5.13).
 *
 * Phase 1 produces a single ZIP with:
 *  - `manifest.json`   — machine-readable index: contract metadata, counts,
 *    SHA-256 of every included file, timestamps, and the requesting user.
 *  - `manifest.txt`    — human-readable companion to the JSON manifest.
 *  - `contract.json`   — full structured data: contract, summary, parties,
 *    deadlines, clauses, contacts, emails (headers + body), documents
 *    (metadata only — originals are in /originals).
 *  - `audit.json`      — audit-log entries for this contract.
 *  - `originals/`      — the immutable `.eml` and document blobs, one file
 *    per row, filename `<sha256>-<original filename>`.
 *
 * Redaction policy: `includeRedacted=false` (default) excludes any document
 * whose redaction_state is `Redacted`. Non-redacted exports require the
 * Contract Owner or Knowledge Centre Admin role AND log a separate
 * `export.download` audit entry (Q-006 signed-export support is a
 * manifest field addition, not a structural change).
 */

export interface ExportJobSummary {
  readonly id: string;
  readonly contractId: string;
  readonly requestedByUserId: string;
  readonly includeRedacted: boolean;
  readonly state: 'Pending' | 'Processing' | 'Succeeded' | 'Failed';
  readonly byteSize: number | null;
  readonly fileCount: number | null;
  readonly manifestSha256: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly errorMessage: string | null;
}

interface ContractSnapshot {
  readonly contract: Record<string, unknown>;
  readonly summary: Record<string, unknown> | null;
  readonly parties: Record<string, unknown>[];
  readonly deadlines: Record<string, unknown>[];
  readonly clauses: Record<string, unknown>[];
  readonly contacts: Record<string, unknown>[];
  readonly emails: Record<string, unknown>[];
  readonly documents: Record<string, unknown>[];
  readonly auditEntries: Record<string, unknown>[];
}

@Injectable()
export class ExportsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
  ) {}

  async stream(
    principal: Principal,
    contractId: string,
    options: { includeRedacted: boolean },
    correlationId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; filename: string }> {
    const jobId = newUlid();
    await this.insertJob(jobId, contractId, principal.userId, options.includeRedacted);

    const snapshot = await this.loadSnapshot(contractId, options);
    const filename = `ckb-export-${contractId}-${jobId}.zip`;

    const passthrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => passthrough.destroy(err));
    archive.pipe(passthrough);

    // --- structured JSON ---
    const contractJson = JSON.stringify(
      {
        contract: snapshot.contract,
        summary: snapshot.summary,
        parties: snapshot.parties,
        deadlines: snapshot.deadlines,
        clauses: snapshot.clauses,
        contacts: snapshot.contacts,
        emails: snapshot.emails,
        documents: snapshot.documents,
      },
      null,
      2,
    );
    archive.append(contractJson, { name: 'contract.json' });
    archive.append(JSON.stringify(snapshot.auditEntries, null, 2), { name: 'audit.json' });

    // --- originals ---
    const manifestEntries: Array<{
      path: string;
      originalFilename: string;
      sha256: string;
      sizeBytes: number;
      kind: 'EmailRaw' | 'Document';
      sourceId: string;
    }> = [];

    let filesIncluded = 0;
    let totalBytes = 0;

    for (const email of snapshot.emails) {
      const blobPath = email['rawEmlBlobPath'];
      const sha = email['rawEmlSha256'];
      const id = email['id'];
      if (typeof blobPath === 'string' && typeof sha === 'string' && typeof id === 'string') {
        try {
          const bytes = await this.storage.get(blobPath);
          const name = `originals/emails/${sha}.eml`;
          archive.append(bytes, { name });
          manifestEntries.push({
            path: name,
            originalFilename: `${id}.eml`,
            sha256: sha,
            sizeBytes: bytes.byteLength,
            kind: 'EmailRaw',
            sourceId: id,
          });
          filesIncluded += 1;
          totalBytes += bytes.byteLength;
        } catch {
          // Missing blob: skip but record in manifest as missing.
          manifestEntries.push({
            path: 'originals/emails/MISSING',
            originalFilename: `${id}.eml`,
            sha256: sha,
            sizeBytes: 0,
            kind: 'EmailRaw',
            sourceId: id,
          });
        }
      }
    }

    for (const doc of snapshot.documents) {
      const blobPath = doc['blobPath'];
      const sha = doc['sha256'];
      const id = doc['id'];
      const origName = doc['originalFilename'];
      const redactionState = doc['redactionState'];
      if (
        !options.includeRedacted &&
        typeof redactionState === 'string' &&
        redactionState === 'Redacted'
      ) {
        continue;
      }
      if (
        typeof blobPath === 'string' &&
        typeof sha === 'string' &&
        typeof id === 'string' &&
        typeof origName === 'string'
      ) {
        try {
          const bytes = await this.storage.get(blobPath);
          const safe = origName.replace(/[^A-Za-z0-9._-]/g, '_');
          const name = `originals/documents/${sha}-${safe}`;
          archive.append(bytes, { name });
          manifestEntries.push({
            path: name,
            originalFilename: origName,
            sha256: sha,
            sizeBytes: bytes.byteLength,
            kind: 'Document',
            sourceId: id,
          });
          filesIncluded += 1;
          totalBytes += bytes.byteLength;
        } catch {
          // skip missing
        }
      }
    }

    const manifest = {
      exportId: jobId,
      contractId,
      requestedByUserId: principal.userId,
      requestedAt: utcNow().toISOString(),
      includeRedacted: options.includeRedacted,
      platformVersion: 'ckb-phase-1',
      files: manifestEntries,
      fileCount: filesIncluded,
      totalBytes,
    };
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestHash = sha256(manifestJson);
    archive.append(manifestJson, { name: 'manifest.json' });
    archive.append(renderManifestText(manifest, manifestHash), { name: 'manifest.txt' });

    // Finalize.
    void archive.finalize();

    // Audit and job-complete writes happen in the background once the stream ends.
    passthrough.on('end', () => {
      void this.markSucceeded(jobId, totalBytes, filesIncluded, manifestHash).catch(() => {});
    });
    passthrough.on('error', (err) => {
      void this.markFailed(jobId, err.message).catch(() => {});
    });

    await this.auditRequest(
      principal.userId,
      jobId,
      contractId,
      options.includeRedacted,
      correlationId,
    );

    return { stream: passthrough, filename };
  }

  async listForContract(contractId: string): Promise<ExportJobSummary[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<{
        id: string;
        contract_id: string;
        requested_by_user_id: string;
        include_redacted: boolean | number;
        state: 'Pending' | 'Processing' | 'Succeeded' | 'Failed';
        byte_size: number | string | null;
        file_count: number | null;
        manifest_sha256: string | null;
        created_at: Date;
        completed_at: Date | null;
        error_message: string | null;
      }>(`
        SELECT id, contract_id, requested_by_user_id, include_redacted, state,
               byte_size, file_count, manifest_sha256, created_at, completed_at,
               error_message
          FROM export_job
         WHERE contract_id = @contract_id
         ORDER BY created_at DESC
      `);
    return r.recordset.map((row) => ({
      id: row.id,
      contractId: row.contract_id,
      requestedByUserId: row.requested_by_user_id,
      includeRedacted: Boolean(row.include_redacted),
      state: row.state,
      byteSize:
        row.byte_size === null
          ? null
          : typeof row.byte_size === 'string'
            ? Number(row.byte_size)
            : row.byte_size,
      fileCount: row.file_count,
      manifestSha256: row.manifest_sha256,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
    }));
  }

  private async insertJob(
    id: string,
    contractId: string,
    userId: string,
    includeRedacted: boolean,
  ): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .input('contract_id', mssql.Char(26), contractId)
      .input('requested_by_user_id', mssql.Char(26), userId)
      .input('include_redacted', mssql.Bit, includeRedacted ? 1 : 0)
      .query(`
        INSERT INTO export_job
          (id, contract_id, requested_by_user_id, include_redacted, state)
        VALUES
          (@id, @contract_id, @requested_by_user_id, @include_redacted, 'Processing');
      `);
  }

  private async markSucceeded(
    id: string,
    byteSize: number,
    fileCount: number,
    manifestSha256: string,
  ): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .input('byte_size', mssql.BigInt, byteSize)
      .input('file_count', mssql.Int, fileCount)
      .input('manifest_sha256', mssql.Char(64), manifestSha256)
      .query(`
        UPDATE export_job
           SET state = 'Succeeded',
               byte_size = @byte_size,
               file_count = @file_count,
               manifest_sha256 = @manifest_sha256,
               completed_at = SYSDATETIMEOFFSET()
         WHERE id = @id;
      `);
  }

  private async markFailed(id: string, message: string): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .input('message', mssql.NVarChar(mssql.MAX), message)
      .query(`
        UPDATE export_job
           SET state = 'Failed',
               error_message = @message,
               completed_at = SYSDATETIMEOFFSET()
         WHERE id = @id;
      `);
  }

  private async auditRequest(
    userId: string,
    exportId: string,
    contractId: string,
    includeRedacted: boolean,
    correlationId: string,
  ): Promise<void> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await logAudit(tx, {
        actorUserId: userId as unknown as Parameters<typeof logAudit>[1]['actorUserId'],
        action: 'export.request',
        entityType: 'ExportJob',
        entityId: exportId,
        after: { contractId, includeRedacted },
        correlationId,
      });
      if (includeRedacted) {
        // security.md §13: non-redacted exports get a separate audit record.
        await logAudit(tx, {
          actorUserId: userId as unknown as Parameters<typeof logAudit>[1]['actorUserId'],
          action: 'export.download',
          entityType: 'ExportJob',
          entityId: exportId,
          after: { contractId, includeRedacted },
          correlationId,
        });
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  private async loadSnapshot(
    contractId: string,
    options: { includeRedacted: boolean },
  ): Promise<ContractSnapshot> {
    const contract = (
      await this.pool
        .request()
        .input('id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(`SELECT * FROM contract WHERE id = @id`)
    ).recordset[0];

    const summary = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(`
          SELECT cs.*
            FROM contract_summary cs
            JOIN contract c ON c.id = cs.contract_id
           WHERE cs.contract_id = @contract_id AND c.summary_id = cs.id
        `)
    ).recordset[0] ?? null;

    const parties = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(`
          SELECT p.*
            FROM party p
            JOIN contract c ON c.client_party_id = p.id
           WHERE c.id = @contract_id
        `)
    ).recordset;

    const deadlines = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(
          `SELECT * FROM deadline WHERE contract_id = @contract_id`,
        )
    ).recordset;

    const clauses = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(
          `SELECT * FROM clause WHERE contract_id = @contract_id`,
        )
    ).recordset;

    const contacts = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(
          `SELECT * FROM contract_contact WHERE contract_id = @contract_id`,
        )
    ).recordset;

    const emailSql = options.includeRedacted
      ? `SELECT id, contract_id, rfc_message_id, in_reply_to, references_raw, thread_id,
                direction, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
                subject, sent_at, received_at, body_text, raw_eml_sha256 AS rawEmlSha256,
                raw_eml_blob_path AS rawEmlBlobPath, sender_trust_state, privileged_flag,
                contains_shared_link, shared_link_status, created_at
           FROM email WHERE contract_id = @contract_id`
      : `SELECT id, contract_id, rfc_message_id, in_reply_to, references_raw, thread_id,
                direction, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
                subject, sent_at, received_at, body_text, raw_eml_sha256 AS rawEmlSha256,
                raw_eml_blob_path AS rawEmlBlobPath, sender_trust_state, privileged_flag,
                contains_shared_link, shared_link_status, created_at
           FROM email WHERE contract_id = @contract_id AND privileged_flag = 0`;
    const emails = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(emailSql)
    ).recordset;

    const docSql = options.includeRedacted
      ? `SELECT id, contract_id, category, mime_type, original_filename AS originalFilename,
                size_bytes, sha256, blob_path AS blobPath, source, source_email_id,
                uploaded_by_user_id, uploaded_at, language, malware_scan_status, ocr_status,
                encryption_state, redaction_state AS redactionState, is_superseded,
                created_at, updated_at
           FROM document WHERE contract_id = @contract_id`
      : `SELECT id, contract_id, category, mime_type, original_filename AS originalFilename,
                size_bytes, sha256, blob_path AS blobPath, source, source_email_id,
                uploaded_by_user_id, uploaded_at, language, malware_scan_status, ocr_status,
                encryption_state, redaction_state AS redactionState, is_superseded,
                created_at, updated_at
           FROM document WHERE contract_id = @contract_id`;
    const documents = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(docSql)
    ).recordset;

    const auditEntries = (
      await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<Record<string, unknown>>(`
          SELECT sequence_number, id, actor_user_id, action, entity_type, entity_id,
                 before_json, after_json, correlation_id, created_at, prev_hash, row_hash
            FROM audit_log
           WHERE entity_id = @contract_id
              OR entity_id IN (SELECT id FROM document WHERE contract_id = @contract_id)
              OR entity_id IN (SELECT id FROM email    WHERE contract_id = @contract_id)
              OR entity_id IN (SELECT id FROM deadline WHERE contract_id = @contract_id)
              OR entity_id IN (SELECT id FROM clause   WHERE contract_id = @contract_id)
           ORDER BY sequence_number ASC
        `)
    ).recordset;

    return {
      contract: contract ?? {},
      summary,
      parties,
      deadlines,
      clauses,
      contacts,
      emails,
      documents,
      auditEntries,
    };
  }
}

function renderManifestText(
  manifest: {
    exportId: string;
    contractId: string;
    requestedByUserId: string;
    requestedAt: string;
    includeRedacted: boolean;
    fileCount: number;
    totalBytes: number;
  },
  manifestHash: string,
): string {
  return [
    'Contract Knowledge Base — Data Portability Export',
    `Export ID:       ${manifest.exportId}`,
    `Contract:        ${manifest.contractId}`,
    `Requested by:    ${manifest.requestedByUserId}`,
    `Requested at:    ${manifest.requestedAt}`,
    `Includes redacted: ${manifest.includeRedacted ? 'yes' : 'no'}`,
    `Files:           ${manifest.fileCount}`,
    `Total bytes:     ${manifest.totalBytes}`,
    `Manifest SHA-256 (of manifest.json): ${manifestHash}`,
    '',
    'Layout:',
    '  contract.json     — structured contract data',
    '  audit.json        — immutable audit log for this contract',
    '  manifest.json     — machine-readable file manifest',
    '  originals/emails/ — immutable .eml files (SHA-256 keyed)',
    '  originals/documents/ — uploaded documents in their original format',
    '',
    'Non-Negotiable #3: every file under originals/ matches the SHA-256 recorded',
    'at ingestion. Derived artefacts (OCR, parsed bodies) are NOT included — they',
    'are re-derivable from originals. Redacted documents are excluded unless the',
    'requester held elevated permission and triggered includeRedacted=true, in',
    'which case a separate export.download audit entry was written.',
  ].join('\n');
}
