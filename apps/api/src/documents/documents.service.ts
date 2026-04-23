import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import { QUEUES, type QueueClient } from '@ckb/queue';
import type { StorageClient } from '@ckb/storage';
import { contentAddressedPath, newUlid, sha256, utcNow } from '@ckb/shared';
import { NotFoundError, ValidationError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import {
  DB_POOL,
  QUEUE_CLIENT,
  STORAGE_CLIENT,
} from '../common/tokens.js';
import type {
  AddTagBody,
  CreateVersionBody,
  ListDocumentsQuery,
  UploadDocumentBody,
} from './dtos.js';

export interface DocumentRow {
  readonly id: string;
  readonly contractId: string;
  readonly category: string;
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly blobPath: string;
  readonly source: string;
  readonly sourceEmailId: string | null;
  readonly uploadedByUserId: string | null;
  readonly uploadedAt: Date;
  readonly language: string;
  readonly malwareScanStatus: string;
  readonly ocrStatus: string;
  readonly encryptionState: string;
  readonly redactionState: string;
  readonly isSuperseded: boolean;
  readonly currentVersionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbDocumentRow {
  id: string;
  contract_id: string;
  category: string;
  mime_type: string;
  original_filename: string;
  size_bytes: number | string;
  sha256: string;
  blob_path: string;
  source: string;
  source_email_id: string | null;
  uploaded_by_user_id: string | null;
  uploaded_at: Date;
  language: string;
  malware_scan_status: string;
  ocr_status: string;
  encryption_state: string;
  redaction_state: string;
  is_superseded: boolean | number;
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapDocument(r: DbDocumentRow): DocumentRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    category: r.category,
    mimeType: r.mime_type,
    originalFilename: r.original_filename,
    sizeBytes: typeof r.size_bytes === 'string' ? Number(r.size_bytes) : r.size_bytes,
    sha256: r.sha256,
    blobPath: r.blob_path,
    source: r.source,
    sourceEmailId: r.source_email_id,
    uploadedByUserId: r.uploaded_by_user_id,
    uploadedAt: r.uploaded_at,
    language: r.language,
    malwareScanStatus: r.malware_scan_status,
    ocrStatus: r.ocr_status,
    encryptionState: r.encryption_state,
    redactionState: r.redaction_state,
    isSuperseded: Boolean(r.is_superseded),
    currentVersionId: r.current_version_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const DOC_SELECT = `
  SELECT id, contract_id, category, mime_type, original_filename, size_bytes,
         sha256, blob_path, source, source_email_id, uploaded_by_user_id, uploaded_at,
         language, malware_scan_status, ocr_status, encryption_state, redaction_state,
         is_superseded, current_version_id, created_at, updated_at
    FROM document
`;

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  async listForContract(
    contractId: string,
    query: ListDocumentsQuery,
  ): Promise<DocumentRow[]> {
    const clauses: string[] = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (query.category) {
      clauses.push('category = @category');
      req.input('category', mssql.VarChar(40), query.category);
    }
    if (!query.includeSuperseded) {
      clauses.push('is_superseded = 0');
    }
    const r = await req.query<DbDocumentRow>(
      `${DOC_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY uploaded_at DESC`,
    );
    return r.recordset.map(mapDocument);
  }

  async get(id: string): Promise<DocumentRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbDocumentRow>(`${DOC_SELECT} WHERE id = @id`);
    const row = r.recordset[0];
    return row ? mapDocument(row) : null;
  }

  async readContent(
    id: string,
  ): Promise<{ bytes: Buffer; mimeType: string; filename: string } | null> {
    const doc = await this.get(id);
    if (!doc) return null;
    if (doc.malwareScanStatus !== 'Clean') {
      throw new ValidationError(
        'Document is not retrievable until malware scan passes',
        { id, malwareScanStatus: doc.malwareScanStatus },
      );
    }
    const bytes = await this.storage.get(doc.blobPath);
    return { bytes, mimeType: doc.mimeType, filename: doc.originalFilename };
  }

  async upload(
    principal: Principal,
    contractId: string,
    body: UploadDocumentBody,
    correlationId: string,
  ): Promise<DocumentRow> {
    const bytes = Buffer.from(body.contentBase64, 'base64');
    if (bytes.byteLength === 0) {
      throw new ValidationError('contentBase64 produced zero bytes');
    }
    const hash = sha256(bytes);
    const blobPath = contentAddressedPath(hash, 'raw');
    // Non-Negotiable #3 — immutable original.
    await this.storage.put(blobPath, bytes, {
      contentType: body.mimeType,
      ifNoneMatch: '*',
      metadata: {
        contractId,
        uploadedByUserId: principal.userId,
      },
    });

    const documentId = newUlid();
    const versionId = newUlid();
    const now = utcNow();
    const language = body.language ?? 'en';

    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), documentId)
        .input('contract_id', mssql.Char(26), contractId)
        .input('category', mssql.VarChar(40), body.category)
        .input('mime_type', mssql.VarChar(128), body.mimeType)
        .input('original_filename', mssql.NVarChar(512), body.originalFilename)
        .input('size_bytes', mssql.BigInt, bytes.byteLength)
        .input('sha256', mssql.Char(64), hash)
        .input('blob_path', mssql.VarChar(512), blobPath)
        .input('source', mssql.VarChar(24), 'ManualUpload')
        .input('uploaded_by_user_id', mssql.Char(26), principal.userId)
        .input('uploaded_at', mssql.DateTimeOffset, now)
        .input('language', mssql.VarChar(10), language)
        .query(`
          INSERT INTO document
            (id, contract_id, category, mime_type, original_filename, size_bytes,
             sha256, blob_path, source, uploaded_by_user_id, uploaded_at, language,
             malware_scan_status, ocr_status, encryption_state, redaction_state,
             is_superseded, created_at, updated_at)
          VALUES
            (@id, @contract_id, @category, @mime_type, @original_filename, @size_bytes,
             @sha256, @blob_path, @source, @uploaded_by_user_id, @uploaded_at, @language,
             'Pending', 'Pending', 'None', 'None',
             0, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        `);

      // First version row anchors the chain.
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), versionId)
        .input('document_id', mssql.Char(26), documentId)
        .input('version_label', mssql.NVarChar(64), 'v1')
        .input('sha256', mssql.Char(64), hash)
        .input('blob_path', mssql.VarChar(512), blobPath)
        .input('size_bytes', mssql.BigInt, bytes.byteLength)
        .input('uploaded_by_user_id', mssql.Char(26), principal.userId)
        .input('uploaded_at', mssql.DateTimeOffset, now)
        .query(`
          INSERT INTO document_version
            (id, document_id, version_label, sha256, blob_path, size_bytes,
             uploaded_by_user_id, uploaded_at)
          VALUES
            (@id, @document_id, @version_label, @sha256, @blob_path, @size_bytes,
             @uploaded_by_user_id, @uploaded_at);
        `);
      await new mssql.Request(tx)
        .input('document_id', mssql.Char(26), documentId)
        .input('version_id', mssql.Char(26), versionId)
        .query(
          `UPDATE document SET current_version_id = @version_id WHERE id = @document_id;`,
        );

      if (body.tagIds && body.tagIds.length > 0) {
        for (const tagId of body.tagIds) {
          await new mssql.Request(tx)
            .input('document_id', mssql.Char(26), documentId)
            .input('tag_id', mssql.Char(26), tagId)
            .input('tagged_by_user_id', mssql.Char(26), principal.userId)
            .query(`
              INSERT INTO document_tag (document_id, tag_id, tagged_by_user_id, tagged_by_source)
              VALUES (@document_id, @tag_id, @tagged_by_user_id, 'Manual');
            `);
        }
      }

      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'document.upload',
        entityType: 'Document',
        entityId: documentId,
        after: {
          contractId,
          category: body.category,
          originalFilename: body.originalFilename,
          sha256: hash,
          sizeBytes: bytes.byteLength,
        },
        correlationId,
      });

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    // Enqueue scan + OCR jobs. Both are idempotent at the worker layer and
    // keyed on the document id to dedupe on retries.
    await this.queue.enqueue(
      QUEUES.malwareScan,
      { documentId, blobPath, sha256: hash, sizeBytes: bytes.byteLength },
      { jobId: `scan:${documentId}` },
    );
    await this.queue.enqueue(
      QUEUES.ocr,
      { documentId, blobPath, mimeType: body.mimeType, language },
      { jobId: `ocr:${documentId}` },
    );

    const created = await this.get(documentId);
    if (!created) throw new Error('Document disappeared after create');
    return created;
  }

  async addTag(
    principal: Principal,
    documentId: string,
    body: AddTagBody,
    correlationId: string,
  ): Promise<void> {
    const doc = await this.get(documentId);
    if (!doc) throw new NotFoundError('Document not found');
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('document_id', mssql.Char(26), documentId)
        .input('tag_id', mssql.Char(26), body.tagId)
        .input('tagged_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM document_tag WHERE document_id = @document_id AND tag_id = @tag_id)
          INSERT INTO document_tag (document_id, tag_id, tagged_by_user_id, tagged_by_source)
          VALUES (@document_id, @tag_id, @tagged_by_user_id, 'Manual');
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'document.tag.add',
        entityType: 'DocumentTag',
        entityId: documentId,
        after: { documentId, tagId: body.tagId },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async removeTag(
    principal: Principal,
    documentId: string,
    tagId: string,
    correlationId: string,
  ): Promise<void> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('document_id', mssql.Char(26), documentId)
        .input('tag_id', mssql.Char(26), tagId)
        .query(`DELETE FROM document_tag WHERE document_id = @document_id AND tag_id = @tag_id;`);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'document.tag.remove',
        entityType: 'DocumentTag',
        entityId: documentId,
        before: { documentId, tagId },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async createVersion(
    principal: Principal,
    documentId: string,
    body: CreateVersionBody,
    correlationId: string,
  ): Promise<DocumentRow> {
    const existing = await this.get(documentId);
    if (!existing) throw new NotFoundError('Document not found');
    const bytes = Buffer.from(body.contentBase64, 'base64');
    if (bytes.byteLength === 0) {
      throw new ValidationError('contentBase64 produced zero bytes');
    }
    const hash = sha256(bytes);
    const blobPath = contentAddressedPath(hash, 'raw');
    await this.storage.put(blobPath, bytes, {
      contentType: body.mimeType,
      ifNoneMatch: '*',
    });

    const versionId = newUlid();
    const now = utcNow();

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      // Mark the previous current version as superseded.
      if (existing.currentVersionId) {
        await new mssql.Request(tx)
          .input('version_id', mssql.Char(26), existing.currentVersionId)
          .input('superseded_by_version_id', mssql.Char(26), versionId)
          .input('superseded_at', mssql.DateTimeOffset, now)
          .query(`
            UPDATE document_version
               SET superseded_at = @superseded_at,
                   superseded_by_version_id = @superseded_by_version_id
             WHERE id = @version_id;
          `);
      }

      await new mssql.Request(tx)
        .input('id', mssql.Char(26), versionId)
        .input('document_id', mssql.Char(26), documentId)
        .input('version_label', mssql.NVarChar(64), body.versionLabel)
        .input('sha256', mssql.Char(64), hash)
        .input('blob_path', mssql.VarChar(512), blobPath)
        .input('size_bytes', mssql.BigInt, bytes.byteLength)
        .input('uploaded_by_user_id', mssql.Char(26), principal.userId)
        .input('uploaded_at', mssql.DateTimeOffset, now)
        .query(`
          INSERT INTO document_version
            (id, document_id, version_label, sha256, blob_path, size_bytes,
             uploaded_by_user_id, uploaded_at)
          VALUES
            (@id, @document_id, @version_label, @sha256, @blob_path, @size_bytes,
             @uploaded_by_user_id, @uploaded_at);
        `);

      await new mssql.Request(tx)
        .input('document_id', mssql.Char(26), documentId)
        .input('version_id', mssql.Char(26), versionId)
        .input('sha256', mssql.Char(64), hash)
        .input('blob_path', mssql.VarChar(512), blobPath)
        .input('size_bytes', mssql.BigInt, bytes.byteLength)
        .input('mime_type', mssql.VarChar(128), body.mimeType)
        .input('original_filename', mssql.NVarChar(512), body.originalFilename)
        .query(`
          UPDATE document
             SET current_version_id = @version_id,
                 sha256 = @sha256,
                 blob_path = @blob_path,
                 size_bytes = @size_bytes,
                 mime_type = @mime_type,
                 original_filename = @original_filename,
                 malware_scan_status = 'Pending',
                 ocr_status = 'Pending',
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @document_id;
        `);

      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'document.version.create',
        entityType: 'DocumentVersion',
        entityId: versionId,
        before: { currentVersionId: existing.currentVersionId },
        after: { documentId, versionLabel: body.versionLabel, sha256: hash },
        correlationId,
      });

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    await this.queue.enqueue(
      QUEUES.malwareScan,
      { documentId, blobPath, sha256: hash, sizeBytes: bytes.byteLength },
      { jobId: `scan:${versionId}` },
    );
    await this.queue.enqueue(
      QUEUES.ocr,
      { documentId, blobPath, mimeType: body.mimeType, language: existing.language },
      { jobId: `ocr:${versionId}` },
    );

    const refreshed = await this.get(documentId);
    if (!refreshed) throw new Error('Document disappeared after version');
    return refreshed;
  }
}
