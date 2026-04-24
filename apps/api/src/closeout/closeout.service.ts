import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  evaluateCloseoutArchiveGate,
  type CloseoutArchiveGateFailure,
  type CloseoutItemStatus,
  type CloseoutTemplateItem,
  type CloseoutTemplateKind,
} from '@ckb/domain';
import {
  ConflictError,
  ForbiddenError,
  newUlid,
  NotFoundError,
  utcNow,
  ValidationError,
} from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

/**
 * Closeout service (Slice HH — §3.23, §6.21, §8.11).
 *
 * Generates a checklist from a template, lets owners sign or waive items,
 * and gates the Contract Closeout → Archived transition on completion.
 *
 * 🔒 HUMAN GATE: waiveItem requires a reason AND the Owner / Administrator
 * contract role. Signing is allowed for any REGISTER_WRITE_ROLES user; waivers
 * are tighter because they skip the evidentiary step.
 *
 * Certificate generation (generateCertificate): records the intended blob
 * path for the closeout certificate. The actual PDF rendering is a TODO —
 * we want the record written so the archive gate has a real audit trail,
 * but the renderer lands with the Evidence Packaging portfolio tool
 * (Slice yet-to-be-built). ASSUMPTION documented inline.
 */

export interface CloseoutTemplateRow {
  readonly id: string;
  readonly kind: CloseoutTemplateKind;
  readonly name: string;
  readonly items: readonly CloseoutTemplateItem[];
  readonly createdAt: Date;
}

export interface CloseoutChecklistRow {
  readonly id: string;
  readonly contractId: string;
  readonly templateId: string;
  readonly generatedCertificateBlobPath: string | null;
  readonly certificateGeneratedAt: Date | null;
  readonly certificateGeneratedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CloseoutItemRow {
  readonly id: string;
  readonly checklistId: string;
  readonly itemKey: string;
  readonly title: string;
  readonly description: string | null;
  readonly ownerUserId: string | null;
  readonly status: CloseoutItemStatus;
  readonly signedAt: Date | null;
  readonly signedByUserId: string | null;
  readonly waiveReason: string | null;
  readonly waivedAt: Date | null;
  readonly waivedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbTemplateRow {
  id: string;
  kind: CloseoutTemplateKind;
  name: string;
  items: string;
  created_at: Date;
}

interface DbChecklistRow {
  id: string;
  contract_id: string;
  template_id: string;
  generated_certificate_blob_path: string | null;
  certificate_generated_at: Date | null;
  certificate_generated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DbItemRow {
  id: string;
  checklist_id: string;
  item_key: string;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  status: CloseoutItemStatus;
  signed_at: Date | null;
  signed_by_user_id: string | null;
  waive_reason: string | null;
  waived_at: Date | null;
  waived_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapTemplate(r: DbTemplateRow): CloseoutTemplateRow {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    items: JSON.parse(r.items) as CloseoutTemplateItem[],
    createdAt: r.created_at,
  };
}

function mapChecklist(r: DbChecklistRow): CloseoutChecklistRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    templateId: r.template_id,
    generatedCertificateBlobPath: r.generated_certificate_blob_path,
    certificateGeneratedAt: r.certificate_generated_at,
    certificateGeneratedByUserId: r.certificate_generated_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapItem(r: DbItemRow): CloseoutItemRow {
  return {
    id: r.id,
    checklistId: r.checklist_id,
    itemKey: r.item_key,
    title: r.title,
    description: r.description,
    ownerUserId: r.owner_user_id,
    status: r.status,
    signedAt: r.signed_at,
    signedByUserId: r.signed_by_user_id,
    waiveReason: r.waive_reason,
    waivedAt: r.waived_at,
    waivedByUserId: r.waived_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

@Injectable()
export class CloseoutService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listTemplates(): Promise<CloseoutTemplateRow[]> {
    const r = await this.pool
      .request()
      .query<DbTemplateRow>(
        `SELECT id, kind, name, items, created_at FROM closeout_template ORDER BY kind ASC, name ASC`,
      );
    return r.recordset.map(mapTemplate);
  }

  async getTemplate(id: string): Promise<CloseoutTemplateRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbTemplateRow>(
        `SELECT id, kind, name, items, created_at FROM closeout_template WHERE id = @id`,
      );
    return r.recordset[0] ? mapTemplate(r.recordset[0]) : null;
  }

  async getForContract(contractId: string): Promise<{
    checklist: CloseoutChecklistRow | null;
    items: CloseoutItemRow[];
  }> {
    const cl = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbChecklistRow>(`
        SELECT id, contract_id, template_id, generated_certificate_blob_path,
               certificate_generated_at, certificate_generated_by_user_id,
               created_at, updated_at
          FROM closeout_checklist
         WHERE contract_id = @contract_id
      `);
    const checklistRow = cl.recordset[0];
    if (!checklistRow) return { checklist: null, items: [] };
    const it = await this.pool
      .request()
      .input('checklist_id', mssql.Char(26), checklistRow.id)
      .query<DbItemRow>(`
        SELECT id, checklist_id, item_key, title, description, owner_user_id,
               status, signed_at, signed_by_user_id, waive_reason, waived_at,
               waived_by_user_id, created_at, updated_at
          FROM closeout_checklist_item
         WHERE checklist_id = @checklist_id
         ORDER BY created_at ASC
      `);
    return {
      checklist: mapChecklist(checklistRow),
      items: it.recordset.map(mapItem),
    };
  }

  async createFromTemplate(
    principal: Principal,
    contractId: string,
    templateId: string,
    correlationId: string,
  ): Promise<CloseoutChecklistRow> {
    const template = await this.getTemplate(templateId);
    if (!template) throw new NotFoundError('Closeout template not found');
    const existing = await this.getForContract(contractId);
    if (existing.checklist) {
      throw new ConflictError('Contract already has a closeout checklist');
    }
    const checklistId = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), checklistId)
        .input('contract_id', mssql.Char(26), contractId)
        .input('template_id', mssql.Char(26), templateId)
        .query(`
          INSERT INTO closeout_checklist (id, contract_id, template_id)
          VALUES (@id, @contract_id, @template_id);
        `);
      for (const item of template.items) {
        const itemId = newUlid();
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), itemId)
          .input('checklist_id', mssql.Char(26), checklistId)
          .input('item_key', mssql.VarChar(64), item.itemKey)
          .input('title', mssql.NVarChar(256), item.title)
          .input('description', mssql.NVarChar(mssql.MAX), item.description ?? null)
          .query(`
            INSERT INTO closeout_checklist_item
              (id, checklist_id, item_key, title, description, status)
            VALUES
              (@id, @checklist_id, @item_key, @title, @description, 'Pending');
          `);
      }
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'closeout.checklist.create',
        entityType: 'CloseoutChecklist',
        entityId: checklistId,
        after: { contractId, templateId, templateKind: template.kind, itemCount: template.items.length },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const { checklist } = await this.getForContract(contractId);
    if (!checklist) throw new Error('Closeout checklist disappeared after create');
    return checklist;
  }

  async signItem(
    principal: Principal,
    itemId: string,
    correlationId: string,
  ): Promise<CloseoutItemRow> {
    const current = await this.getItem(itemId);
    if (!current) throw new NotFoundError('Closeout checklist item not found');
    if (current.status === 'Signed') return current;
    if (current.status === 'Waived') {
      throw new ConflictError('Item has already been waived; cannot sign');
    }
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), itemId)
        .input('signed_by', mssql.Char(26), principal.userId)
        .input('signed_at', mssql.DateTimeOffset, utcNow())
        .query(`
          UPDATE closeout_checklist_item
             SET status = 'Signed',
                 signed_at = @signed_at,
                 signed_by_user_id = @signed_by,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id AND status = 'Pending';
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'closeout.item.sign',
        entityType: 'CloseoutChecklistItem',
        entityId: itemId,
        before: { status: current.status },
        after: { status: 'Signed' },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.getItem(itemId);
    if (!row) throw new Error('Closeout item disappeared after sign');
    return row;
  }

  /**
   * 🔒 HUMAN GATE: waiver requires a reason + Owner or Administrator role.
   */
  async waiveItem(
    principal: Principal,
    itemId: string,
    reason: string,
    role: string,
    correlationId: string,
  ): Promise<CloseoutItemRow> {
    if (role !== 'Owner' && role !== 'Administrator') {
      throw new ForbiddenError(
        'Only the Contract Owner or Administrator can waive a closeout item (§6.21 HUMAN GATE)',
      );
    }
    const trimmed = reason.trim();
    if (trimmed.length < 4) {
      throw new ValidationError('Waive reason is required (min 4 characters)');
    }
    const current = await this.getItem(itemId);
    if (!current) throw new NotFoundError('Closeout checklist item not found');
    if (current.status === 'Waived') return current;
    if (current.status === 'Signed') {
      throw new ConflictError('Item has already been signed; cannot waive');
    }
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), itemId)
        .input('waived_by', mssql.Char(26), principal.userId)
        .input('waived_at', mssql.DateTimeOffset, utcNow())
        .input('reason', mssql.NVarChar(1024), trimmed)
        .query(`
          UPDATE closeout_checklist_item
             SET status = 'Waived',
                 waived_at = @waived_at,
                 waived_by_user_id = @waived_by,
                 waive_reason = @reason,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id AND status = 'Pending';
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'closeout.item.waive',
        entityType: 'CloseoutChecklistItem',
        entityId: itemId,
        before: { status: current.status },
        after: { status: 'Waived', reason: trimmed },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.getItem(itemId);
    if (!row) throw new Error('Closeout item disappeared after waive');
    return row;
  }

  /**
   * Marks the certificate as generated for the checklist on this contract.
   *
   * ASSUMPTION: actual PDF rendering is deferred. We write the intended blob
   * path + stamp so the archive gate (§6.21) and audit trail have a real
   * record. The PDF itself will be produced by the Evidence Packaging tool
   * (§6.11) when that ships — this keeps the lifecycle working without
   * blocking on the renderer. TODO: replace blobPath stub with actual
   * generated artifact once the renderer exists.
   */
  async generateCertificate(
    principal: Principal,
    contractId: string,
    correlationId: string,
  ): Promise<CloseoutChecklistRow> {
    const { checklist, items } = await this.getForContract(contractId);
    if (!checklist) throw new NotFoundError('No closeout checklist for this contract');
    const pending = items.filter((i) => i.status === 'Pending').length;
    if (pending > 0) {
      throw new ConflictError(
        `Cannot generate certificate while ${pending} item(s) remain Pending`,
      );
    }
    // ASSUMPTION: placeholder blob path until the renderer lands.
    const blobPath = `closeout-certificates/${contractId}/${checklist.id}/certificate.pdf`;
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), checklist.id)
        .input('blob_path', mssql.NVarChar(1024), blobPath)
        .input('by', mssql.Char(26), principal.userId)
        .input('at', mssql.DateTimeOffset, utcNow())
        .query(`
          UPDATE closeout_checklist
             SET generated_certificate_blob_path = @blob_path,
                 certificate_generated_at = @at,
                 certificate_generated_by_user_id = @by,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id;
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'closeout.certificate.generate',
        entityType: 'CloseoutChecklist',
        entityId: checklist.id,
        after: { contractId, blobPath, itemCount: items.length },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const { checklist: updated } = await this.getForContract(contractId);
    if (!updated) throw new Error('Closeout checklist disappeared after certificate generate');
    return updated;
  }

  /**
   * Archive-gate check for the Contract FSM (§6.21). Returns null when the
   * transition Closeout → Archived is allowed, or a structured failure
   * reason otherwise.
   *
   * The renderer-gated certificate is treated as optional here
   * (requireCertificate=false) so the archive path does not block on the
   * TODO'd PDF renderer. This is a conservative default; flip the flag
   * once §6.11 ships.
   */
  async evaluateArchiveGate(
    contractId: string,
  ): Promise<CloseoutArchiveGateFailure | null> {
    const { checklist, items } = await this.getForContract(contractId);
    const pending = items.filter((i) => i.status === 'Pending').length;
    return evaluateCloseoutArchiveGate({
      hasChecklist: checklist !== null,
      pendingCount: pending,
      certificateGenerated: checklist?.generatedCertificateBlobPath !== null && checklist?.generatedCertificateBlobPath !== undefined,
      requireCertificate: false,
    });
  }

  private async getItem(id: string): Promise<CloseoutItemRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbItemRow>(`
        SELECT id, checklist_id, item_key, title, description, owner_user_id,
               status, signed_at, signed_by_user_id, waive_reason, waived_at,
               waived_by_user_id, created_at, updated_at
          FROM closeout_checklist_item
         WHERE id = @id
      `);
    return r.recordset[0] ? mapItem(r.recordset[0]) : null;
  }
}
