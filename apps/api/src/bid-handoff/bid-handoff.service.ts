import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type {
  BidHandoffCorrespondenceItem,
  BidHandoffContact,
  BidHandoffPayload,
  BidHandoffRiskItem,
  BidHandoffStatus,
  UserId,
} from '@ckb/domain';
import {
  asBrandedId,
  contentAddressedPath,
  newUlid,
  sha256,
  NotFoundError,
  ValidationError,
} from '@ckb/shared';
import type { StorageClient } from '@ckb/storage';
import { QUEUES, type QueueClient } from '@ckb/queue';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL, QUEUE_CLIENT, STORAGE_CLIENT } from '../common/tokens.js';
import { assertContractExists } from '../common/register-helpers.js';

/**
 * Bid-to-Contract Handoff service (Slice Y, §6.1).
 *
 * Idempotent on (bid_id, contract_id): a replay of the same payload is a
 * no-op — the existing handoff row is returned unchanged. Everything we
 * create is additive: risks land as `Unverified` (NN #2), contacts are
 * inserted verbatim, correspondence items are ingested as documents with
 * `source='BidHandoff'` so the rest of the platform treats them as any
 * other uploaded document.
 *
 * We do NOT touch the contract lifecycle state here — the Contract Owner
 * approves the summary and moves Onboarding → Active through the existing
 * summary-verification flow (§5.4).
 */

export type BidHandoffReceivedVia = 'UserSession' | 'ApiKey';

export interface BidHandoffRow {
  readonly id: string;
  readonly contractId: string;
  readonly bidId: string;
  readonly sourceSystem: string;
  readonly status: BidHandoffStatus;
  readonly receivedAt: Date;
  readonly receivedByUserId: string | null;
  readonly receivedVia: BidHandoffReceivedVia;
  readonly rawPayloadSha256: string;
  readonly risksCreated: number;
  readonly contactsCreated: number;
  readonly documentsCreated: number;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  bid_id: string;
  source_system: string;
  status: BidHandoffStatus;
  received_at: Date;
  received_by_user_id: string | null;
  received_via: BidHandoffReceivedVia;
  raw_payload_sha256: string;
  risks_created: number;
  contacts_created: number;
  documents_created: number;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: DbRow): BidHandoffRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    bidId: r.bid_id,
    sourceSystem: r.source_system,
    status: r.status,
    receivedAt: r.received_at,
    receivedByUserId: r.received_by_user_id,
    receivedVia: r.received_via,
    rawPayloadSha256: r.raw_payload_sha256,
    risksCreated: r.risks_created,
    contactsCreated: r.contacts_created,
    documentsCreated: r.documents_created,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, bid_id, source_system, status, received_at,
         received_by_user_id, received_via, raw_payload_sha256,
         risks_created, contacts_created, documents_created,
         error_message, created_at, updated_at
    FROM bid_handoff
`;

export interface ReceiveBidHandoffInput {
  readonly payload: BidHandoffPayload;
  readonly receivedVia: BidHandoffReceivedVia;
  readonly dryRun: boolean;
}

export interface ReceiveBidHandoffResult {
  readonly handoff: BidHandoffRow | null;
  readonly dryRun: boolean;
  readonly risksPreviewCount: number;
  readonly contactsPreviewCount: number;
  readonly documentsPreviewCount: number;
  readonly replay: boolean;
}

@Injectable()
export class BidHandoffService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  async listForContract(contractId: string): Promise<BidHandoffRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY received_at DESC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<BidHandoffRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async receive(
    principal: Principal | null,
    contractId: string,
    input: ReceiveBidHandoffInput,
    correlationId: string,
  ): Promise<ReceiveBidHandoffResult> {
    await assertContractExists(this.pool, contractId);

    const payload = input.payload;
    this.validatePayload(payload);

    const rawJson = JSON.stringify(payload);
    const rawHash = sha256(Buffer.from(rawJson, 'utf8'));

    // Idempotency check — (bid_id, contract_id) unique.
    const existing = await this.pool
      .request()
      .input('bid_id', mssql.NVarChar(128), payload.bidId)
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(
        `${SELECT} WHERE bid_id = @bid_id AND contract_id = @contract_id`,
      );
    const prior = existing.recordset[0] ? mapRow(existing.recordset[0]) : null;

    if (input.dryRun) {
      return {
        handoff: prior,
        dryRun: true,
        risksPreviewCount: payload.bidPhaseRisks.length,
        contactsPreviewCount: payload.contacts.length,
        documentsPreviewCount: payload.keyCorrespondence.length,
        replay: prior !== null,
      };
    }

    if (prior) {
      // Replay: record the attempt in the audit trail, but leave the
      // original handoff row and its derived data untouched.
      const tx = new mssql.Transaction(this.pool);
      await tx.begin();
      try {
        const replayActor = principal?.userId ?? asBrandedId<'User'>(await this.resolveSystemUserId());
        await logAudit(tx, {
          actorUserId: replayActor,
          action: 'bid_handoff.replay',
          entityType: 'BidHandoff',
          entityId: prior.id,
          before: { rawPayloadSha256: prior.rawPayloadSha256 },
          after: { rawPayloadSha256: rawHash, matches: rawHash === prior.rawPayloadSha256 },
          correlationId,
        });
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
      return {
        handoff: prior,
        dryRun: false,
        risksPreviewCount: payload.bidPhaseRisks.length,
        contactsPreviewCount: payload.contacts.length,
        documentsPreviewCount: payload.keyCorrespondence.length,
        replay: true,
      };
    }

    // Upload correspondence to blob storage BEFORE starting the DB tx so
    // we don't hold the tx open across network calls. Each is
    // content-addressed and write-once per NN #3.
    const documentBlobs: { blobPath: string; hash: string; sizeBytes: number; item: BidHandoffCorrespondenceItem }[] = [];
    for (const item of payload.keyCorrespondence) {
      const bytes = Buffer.from(item.contentBase64, 'base64');
      if (bytes.byteLength === 0) {
        throw new ValidationError(`keyCorrespondence item '${item.originalFilename}' decoded to zero bytes`);
      }
      const hash = sha256(bytes);
      const blobPath = contentAddressedPath(hash, 'raw');
      await this.storage.put(blobPath, bytes, {
        contentType: item.mimeType,
        ifNoneMatch: '*',
        metadata: { contractId, source: 'BidHandoff' },
      });
      documentBlobs.push({ blobPath, hash, sizeBytes: bytes.byteLength, item });
    }

    const systemUserId = await this.resolveSystemUserId();
    const actorUserId = principal?.userId ?? asBrandedId<'User'>(systemUserId);
    const handoffId = newUlid();
    const createdDocumentIds: string[] = [];
    let risksCreated = 0;
    let contactsCreated = 0;
    let documentsCreated = 0;

    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), handoffId)
        .input('contract_id', mssql.Char(26), contractId)
        .input('bid_id', mssql.NVarChar(128), payload.bidId)
        .input('source_system', mssql.VarChar(40), payload.sourceSystem)
        .input('received_by_user_id', mssql.Char(26), principal?.userId ?? null)
        .input('received_via', mssql.VarChar(16), input.receivedVia)
        .input('raw_payload', mssql.NVarChar(mssql.MAX), rawJson)
        .input('raw_payload_sha256', mssql.Char(64), rawHash)
        .query(`
          INSERT INTO bid_handoff
            (id, contract_id, bid_id, source_system, received_by_user_id,
             received_via, raw_payload, raw_payload_sha256, status,
             risks_created, contacts_created, documents_created)
          VALUES
            (@id, @contract_id, @bid_id, @source_system, @received_by_user_id,
             @received_via, @raw_payload, @raw_payload_sha256, 'Received',
             0, 0, 0);
        `);

      // Risks — land as Unverified per NN #2.
      risksCreated = await this.insertRisks(
        tx,
        contractId,
        actorUserId,
        payload.bidPhaseRisks,
        correlationId,
      );

      // Contacts.
      contactsCreated = await this.insertContacts(
        tx,
        contractId,
        actorUserId,
        payload.contacts,
        correlationId,
      );

      // Documents from correspondence items.
      for (const blob of documentBlobs) {
        const docId = await this.insertDocument(
          tx,
          contractId,
          actorUserId,
          blob.blobPath,
          blob.hash,
          blob.sizeBytes,
          blob.item,
          correlationId,
        );
        createdDocumentIds.push(docId);
      }
      documentsCreated = createdDocumentIds.length;

      await new mssql.Request(tx)
        .input('id', mssql.Char(26), handoffId)
        .input('risks_created', mssql.Int, risksCreated)
        .input('contacts_created', mssql.Int, contactsCreated)
        .input('documents_created', mssql.Int, documentsCreated)
        .query(`
          UPDATE bid_handoff
             SET risks_created = @risks_created,
                 contacts_created = @contacts_created,
                 documents_created = @documents_created,
                 status = 'Processed',
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id;
        `);

      await logAudit(tx, {
        actorUserId,
        action: 'bid_handoff.receive',
        entityType: 'BidHandoff',
        entityId: handoffId,
        after: {
          contractId,
          bidId: payload.bidId,
          sourceSystem: payload.sourceSystem,
          risksCreated,
          contactsCreated,
          documentsCreated,
          receivedVia: input.receivedVia,
          rawPayloadSha256: rawHash,
        },
        correlationId,
      });

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    // Enqueue scan + OCR per created document (outside tx, matches DocumentsService pattern).
    for (const docId of createdDocumentIds) {
      const doc = documentBlobs[createdDocumentIds.indexOf(docId)];
      if (!doc) continue;
      await this.queue.enqueue(
        QUEUES.malwareScan,
        { documentId: docId, blobPath: doc.blobPath, sha256: doc.hash, sizeBytes: doc.sizeBytes },
        { jobId: `scan_${docId}` },
      );
      await this.queue.enqueue(
        QUEUES.ocr,
        { documentId: docId, blobPath: doc.blobPath, mimeType: doc.item.mimeType, language: 'en' },
        { jobId: `ocr_${docId}` },
      );
    }

    const row = await this.get(handoffId);
    if (!row) throw new Error('BidHandoff disappeared after create');
    return {
      handoff: row,
      dryRun: false,
      risksPreviewCount: payload.bidPhaseRisks.length,
      contactsPreviewCount: payload.contacts.length,
      documentsPreviewCount: payload.keyCorrespondence.length,
      replay: false,
    };
  }

  private validatePayload(payload: BidHandoffPayload): void {
    if (!payload.bidId || payload.bidId.trim().length === 0) {
      throw new ValidationError('bidId is required');
    }
    if (!payload.sourceSystem || payload.sourceSystem.trim().length === 0) {
      throw new ValidationError('sourceSystem is required');
    }
    if (!payload.winningProposal) {
      throw new ValidationError('winningProposal is required');
    }
  }

  private async insertRisks(
    tx: mssql.Transaction,
    contractId: string,
    actorUserId: UserId,
    risks: readonly BidHandoffRiskItem[],
    correlationId: string,
  ): Promise<number> {
    let count = 0;
    for (const r of risks) {
      const id = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('title', mssql.NVarChar(512), r.title)
        .input('description', mssql.NVarChar(mssql.MAX), r.description)
        .input('category', mssql.VarChar(40), r.category)
        .input('probability', mssql.VarChar(8), r.probability)
        .input('impact', mssql.VarChar(8), r.impact)
        .input('mitigation', mssql.NVarChar(mssql.MAX), r.mitigation)
        .input('created_by_user_id', mssql.Char(26), actorUserId)
        .query(`
          INSERT INTO risk
            (id, contract_id, title, description, category, probability, impact,
             mitigation, status, source, created_by_user_id)
          VALUES
            (@id, @contract_id, @title, @description, @category, @probability, @impact,
             @mitigation, 'Open', 'BidHandoff', @created_by_user_id);
        `);
      // ASSUMPTION: Risk register does not yet carry a verification_state
      // column (see Slice S migration 0012) — the source='BidHandoff' marker
      // plus the unverified-until-reviewed convention from NN #2 is enforced
      // by the review-queue UI surface. Risk-verification column is Q-RISK-1.
      await logAudit(tx, {
        actorUserId,
        action: 'risk.create',
        entityType: 'Risk',
        entityId: id,
        after: { contractId, title: r.title, source: 'BidHandoff', unverified: true },
        correlationId,
      });
      count += 1;
    }
    return count;
  }

  private async insertContacts(
    tx: mssql.Transaction,
    contractId: string,
    actorUserId: UserId,
    contacts: readonly BidHandoffContact[],
    correlationId: string,
  ): Promise<number> {
    let count = 0;
    for (const c of contacts) {
      const id = newUlid();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('party_id', mssql.Char(26), null)
        .input('name', mssql.NVarChar(256), c.name)
        .input('role_title', mssql.NVarChar(256), c.roleTitle)
        .input('email', mssql.NVarChar(320), c.email)
        .input('phone', mssql.NVarChar(64), c.phone)
        .input('authority_level', mssql.VarChar(40), c.authorityLevel)
        .input('notes', mssql.NVarChar(2000), c.notes)
        .input('created_by_user_id', mssql.Char(26), actorUserId)
        .query(`
          INSERT INTO contract_contact
            (id, contract_id, party_id, name, role_title, email, phone,
             authority_level, notes, created_by_user_id)
          VALUES
            (@id, @contract_id, @party_id, @name, @role_title, @email, @phone,
             @authority_level, @notes, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId,
        action: 'contact.create',
        entityType: 'ContractContact',
        entityId: id,
        after: { contractId, name: c.name, email: c.email, source: 'BidHandoff' },
        correlationId,
      });
      count += 1;
    }
    return count;
  }

  private async insertDocument(
    tx: mssql.Transaction,
    contractId: string,
    actorUserId: UserId,
    blobPath: string,
    hash: string,
    sizeBytes: number,
    item: BidHandoffCorrespondenceItem,
    correlationId: string,
  ): Promise<string> {
    const documentId = newUlid();
    const versionId = newUlid();
    const category = item.kind === 'Email' ? 'Correspondence' : 'Other';
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), documentId)
      .input('contract_id', mssql.Char(26), contractId)
      .input('category', mssql.VarChar(40), category)
      .input('mime_type', mssql.VarChar(128), item.mimeType)
      .input('original_filename', mssql.NVarChar(512), item.originalFilename)
      .input('size_bytes', mssql.BigInt, sizeBytes)
      .input('sha256', mssql.Char(64), hash)
      .input('blob_path', mssql.VarChar(512), blobPath)
      .input('source', mssql.VarChar(24), 'BidHandoff')
      .input('uploaded_by_user_id', mssql.Char(26), actorUserId)
      .input('language', mssql.VarChar(10), 'en')
      .query(`
        INSERT INTO document
          (id, contract_id, category, mime_type, original_filename, size_bytes,
           sha256, blob_path, source, uploaded_by_user_id, uploaded_at, language,
           malware_scan_status, ocr_status, encryption_state, redaction_state,
           is_superseded, created_at, updated_at)
        VALUES
          (@id, @contract_id, @category, @mime_type, @original_filename, @size_bytes,
           @sha256, @blob_path, @source, @uploaded_by_user_id, SYSDATETIMEOFFSET(), @language,
           'Pending', 'Pending', 'None', 'None',
           0, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `);
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), versionId)
      .input('document_id', mssql.Char(26), documentId)
      .input('version_label', mssql.NVarChar(64), 'v1')
      .input('sha256', mssql.Char(64), hash)
      .input('blob_path', mssql.VarChar(512), blobPath)
      .input('size_bytes', mssql.BigInt, sizeBytes)
      .input('uploaded_by_user_id', mssql.Char(26), actorUserId)
      .query(`
        INSERT INTO document_version
          (id, document_id, version_label, sha256, blob_path, size_bytes,
           uploaded_by_user_id, uploaded_at)
        VALUES
          (@id, @document_id, @version_label, @sha256, @blob_path, @size_bytes,
           @uploaded_by_user_id, SYSDATETIMEOFFSET());
      `);
    await new mssql.Request(tx)
      .input('document_id', mssql.Char(26), documentId)
      .input('version_id', mssql.Char(26), versionId)
      .query(`UPDATE document SET current_version_id = @version_id WHERE id = @document_id;`);

    await logAudit(tx, {
      actorUserId: actorUserId as never,
      action: 'document.upload',
      entityType: 'Document',
      entityId: documentId,
      after: {
        contractId,
        category,
        originalFilename: item.originalFilename,
        sha256: hash,
        sizeBytes,
        source: 'BidHandoff',
      },
      correlationId,
    });
    return documentId;
  }

  private async resolveSystemUserId(): Promise<string> {
    const r = await this.pool.request().query<{ id: string }>(
      `SELECT TOP 1 id FROM app_user
        WHERE global_role IN ('SystemAdministrator','KnowledgeCentreAdministrator')
        ORDER BY created_at ASC`,
    );
    const id = r.recordset[0]?.id;
    if (!id) throw new NotFoundError('No SystemAdministrator/KnowledgeCentreAdministrator user available');
    return id;
  }
}
