import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  ensureProjectBcc,
  parseSubjectLine,
  type CorrespondenceKind,
  type OutboundStatus,
} from '@ckb/domain';
import {
  ConflictError,
  newUlid,
  NotFoundError,
  requireCorrelationId,
  utcNow,
  ValidationError,
} from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  UseGuards,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import mssql from 'mssql';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  requireRole,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { REGISTER_READ_ROLES, REGISTER_WRITE_ROLES } from '../common/register-helpers.js';
import { DB_POOL } from '../common/tokens.js';

/**
 * EmailSender abstraction (ACS/SendGrid/etc.). In dev we use a no-op
 * console logger; production wires Azure Communication Services with
 * DKIM signing on contracts.technicamining.com per SOW §6.16.
 */
export interface EmailSenderPayload {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly bcc: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string | null;
  readonly attachments: readonly {
    readonly filename: string;
    readonly contentType: string;
    readonly blobPath: string;
  }[];
}

export interface EmailSender {
  send(payload: EmailSenderPayload): Promise<{ messageId: string }>;
}

class ConsoleEmailSender implements EmailSender {
  async send(payload: EmailSenderPayload): Promise<{ messageId: string }> {
    // ASSUMPTION: Azure Communication Services wiring is deferred (Q-ACS-1).
    // In dev/test we log the envelope and return a synthetic Message-ID so
    // the audit trail and NN #10 invariant can be exercised end-to-end.
    console.warn('[outbound-dev] would send', {
      to: payload.to,
      cc: payload.cc,
      bccCount: payload.bcc.length,
      subject: payload.subject,
    });
    return { messageId: `dev-${newUlid()}@contracts.technicamining.com` };
  }
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface OutboundRow {
  readonly id: string;
  readonly contractId: string;
  readonly correspondenceNumber: number;
  readonly kind: CorrespondenceKind;
  readonly revision: number;
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly subject: string;
  readonly bodyText: string;
  readonly bodyHtml: string | null;
  readonly toAddresses: string[];
  readonly ccAddresses: string[];
  readonly bccAddresses: string[];
  readonly projectBccAddress: string;
  readonly status: OutboundStatus;
  readonly dkimMessageId: string | null;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly failureReason: string | null;
  readonly createdByUserId: string;
  readonly sentByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  correspondence_number: number;
  kind: CorrespondenceKind;
  revision: number;
  template_id: string | null;
  template_version: number | null;
  subject: string;
  body_text: string;
  body_html: string | null;
  to_addresses: string;
  cc_addresses: string | null;
  bcc_addresses: string;
  project_bcc_address: string;
  status: OutboundStatus;
  dkim_message_id: string | null;
  sent_at: Date | null;
  failed_at: Date | null;
  failure_reason: string | null;
  created_by_user_id: string;
  sent_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function splitAddresses(packed: string | null): string[] {
  if (!packed) return [];
  return packed.split('\n').map((a) => a.trim()).filter((a) => a.length > 0);
}

function packAddresses(addresses: readonly string[]): string {
  return addresses.map((a) => a.trim()).filter((a) => a.length > 0).join('\n');
}

function mapRow(r: DbRow): OutboundRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    correspondenceNumber: r.correspondence_number,
    kind: r.kind,
    revision: r.revision,
    templateId: r.template_id,
    templateVersion: r.template_version,
    subject: r.subject,
    bodyText: r.body_text,
    bodyHtml: r.body_html,
    toAddresses: splitAddresses(r.to_addresses),
    ccAddresses: splitAddresses(r.cc_addresses),
    bccAddresses: splitAddresses(r.bcc_addresses),
    projectBccAddress: r.project_bcc_address,
    status: r.status,
    dkimMessageId: r.dkim_message_id,
    sentAt: r.sent_at,
    failedAt: r.failed_at,
    failureReason: r.failure_reason,
    createdByUserId: r.created_by_user_id,
    sentByUserId: r.sent_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, correspondence_number, kind, revision,
         template_id, template_version, subject, body_text, body_html,
         to_addresses, cc_addresses, bcc_addresses, project_bcc_address,
         status, dkim_message_id, sent_at, failed_at, failure_reason,
         created_by_user_id, sent_by_user_id, created_at, updated_at
    FROM outbound_correspondence
`;

export interface CreateDraftInput {
  readonly kind: CorrespondenceKind;
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly subjectBrief: string;
  readonly revision: number;
  readonly toAddresses: string[];
  readonly ccAddresses: string[];
  readonly bccAddresses: string[];
  readonly bodyText: string;
  readonly bodyHtml: string | null;
}

@Injectable()
export class OutboundService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
  ) {}

  async list(contractId: string): Promise<OutboundRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY created_at DESC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<OutboundRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  private async getContractAlias(
    contractId: string,
  ): Promise<{ alias: string; projectAddress: string } | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), contractId)
      .query<{ project_email_alias: string | null; project_email_address: string }>(
        'SELECT project_email_alias, project_email_address FROM contract WHERE id = @id',
      );
    const row = r.recordset[0];
    if (!row) return null;
    const aliasLocal = (row.project_email_alias ?? row.project_email_address)
      .split('@')[0]!;
    return { alias: aliasLocal, projectAddress: row.project_email_address };
  }

  async createDraft(
    principal: Principal,
    contractId: string,
    input: CreateDraftInput,
    correlationId: string,
  ): Promise<OutboundRow> {
    const addr = await this.getContractAlias(contractId);
    if (!addr) throw new NotFoundError('Contract not found');

    // NN #10 — ensure project address is in the BCC list, even if caller forgot.
    const bccWithProject = ensureProjectBcc(input.bccAddresses, addr.projectAddress);
    if (input.toAddresses.length === 0) {
      throw new ValidationError('toAddresses must include at least one recipient');
    }

    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const seqResult = await new mssql.Request(tx)
        .input('contract_id', mssql.Char(26), contractId)
        .input('kind', mssql.VarChar(40), input.kind)
        .query<{ next: number | null }>(`
          SELECT ISNULL(MAX(correspondence_number), 0) + 1 AS next
            FROM outbound_correspondence WITH (UPDLOCK, HOLDLOCK)
           WHERE contract_id = @contract_id AND kind = @kind AND revision = 0
        `);
      const nextNumber = seqResult.recordset[0]?.next ?? 1;

      // Compose the enforced subject (§6.16).
      const subject = `[${addr.alias}] ${input.kind}-${nextNumber}/R${input.revision} — ${input.subjectBrief}`;
      const parsed = parseSubjectLine(subject);
      if (!parsed.ok) {
        throw new ValidationError(
          `Composed subject failed parse: ${parsed.reason}. Subject = ${subject}`,
        );
      }

      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('correspondence_number', mssql.Int, nextNumber)
        .input('kind', mssql.VarChar(40), input.kind)
        .input('revision', mssql.Int, input.revision)
        .input('template_id', mssql.Char(26), input.templateId)
        .input('template_version', mssql.Int, input.templateVersion)
        .input('subject', mssql.NVarChar(512), subject)
        .input('body_text', mssql.NVarChar(mssql.MAX), input.bodyText)
        .input('body_html', mssql.NVarChar(mssql.MAX), input.bodyHtml)
        .input('to_addresses', mssql.NVarChar(mssql.MAX), packAddresses(input.toAddresses))
        .input('cc_addresses', mssql.NVarChar(mssql.MAX), packAddresses(input.ccAddresses))
        .input('bcc_addresses', mssql.NVarChar(mssql.MAX), packAddresses(bccWithProject))
        .input('project_bcc_address', mssql.VarChar(320), addr.projectAddress)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO outbound_correspondence
            (id, contract_id, correspondence_number, kind, revision,
             template_id, template_version, subject, body_text, body_html,
             to_addresses, cc_addresses, bcc_addresses, project_bcc_address,
             created_by_user_id)
          VALUES
            (@id, @contract_id, @correspondence_number, @kind, @revision,
             @template_id, @template_version, @subject, @body_text, @body_html,
             @to_addresses, @cc_addresses, @bcc_addresses, @project_bcc_address,
             @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'outbound_correspondence.draft',
        entityType: 'OutboundCorrespondence',
        entityId: id,
        after: { contractId, kind: input.kind, subject, revision: input.revision },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Outbound correspondence disappeared after draft');
    return row;
  }

  async send(
    principal: Principal,
    id: string,
    correlationId: string,
  ): Promise<OutboundRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Outbound correspondence not found');
    if (current.status !== 'Draft' && current.status !== 'Failed') {
      throw new ConflictError(`Cannot send from status ${current.status}`);
    }
    // NN #10 final check at send — defense in depth against UI drift.
    if (
      !current.bccAddresses.some(
        (a) => a.toLowerCase().trim() === current.projectBccAddress.toLowerCase(),
      )
    ) {
      throw new ValidationError(
        'Project BCC invariant violated (NN #10). Refusing to send.',
      );
    }

    // Mark Sending
    await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query(
        `UPDATE outbound_correspondence SET status = 'Sending', updated_at = SYSDATETIMEOFFSET() WHERE id = @id;`,
      );

    try {
      const { messageId } = await this.sender.send({
        from: current.projectBccAddress,
        to: current.toAddresses,
        cc: current.ccAddresses,
        bcc: current.bccAddresses,
        subject: current.subject,
        text: current.bodyText,
        html: current.bodyHtml,
        attachments: [],
      });

      const tx = new mssql.Transaction(this.pool);
      await tx.begin();
      try {
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), id)
          .input('message_id', mssql.VarChar(512), messageId)
          .input('sent_by_user_id', mssql.Char(26), principal.userId)
          .input('sent_at', mssql.DateTimeOffset, utcNow())
          .query(`
            UPDATE outbound_correspondence
               SET status = 'Sent',
                   dkim_message_id = @message_id,
                   sent_by_user_id = @sent_by_user_id,
                   sent_at = @sent_at,
                   updated_at = SYSDATETIMEOFFSET()
             WHERE id = @id;
          `);
        await logAudit(tx, {
          actorUserId: principal.userId,
          action: 'outbound_correspondence.send',
          entityType: 'OutboundCorrespondence',
          entityId: id,
          before: { status: current.status },
          after: { status: 'Sent', messageId, subject: current.subject },
          correlationId,
        });
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const tx = new mssql.Transaction(this.pool);
      await tx.begin();
      try {
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), id)
          .input('failure_reason', mssql.NVarChar(1024), reason.slice(0, 1024))
          .input('failed_at', mssql.DateTimeOffset, utcNow())
          .query(`
            UPDATE outbound_correspondence
               SET status = 'Failed',
                   failure_reason = @failure_reason,
                   failed_at = @failed_at,
                   updated_at = SYSDATETIMEOFFSET()
             WHERE id = @id;
          `);
        await logAudit(tx, {
          actorUserId: principal.userId,
          action: 'outbound_correspondence.send_failed',
          entityType: 'OutboundCorrespondence',
          entityId: id,
          after: { reason },
          correlationId,
        });
        await tx.commit();
      } catch (e2) {
        await tx.rollback();
        throw e2;
      }
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Outbound correspondence disappeared after send');
    return updated;
  }
}

const KindEnum = z.enum([
  'RFI', 'DelayNotice', 'VariationRequest', 'ChangeOrderResponse',
  'NoticeOfDefault', 'CureNotice', 'GeneralCorrespondence',
  'ClaimSubmission', 'InsuranceNotice', 'CloseoutCorrespondence',
]);

const DraftBody = z.object({
  kind: KindEnum,
  templateId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
  templateVersion: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
  subjectBrief: z.string().min(1).max(256),
  revision: z.number().int().nonnegative().default(0),
  toAddresses: z.array(z.string().email()).min(1),
  ccAddresses: z.array(z.string().email()).default([]),
  bccAddresses: z.array(z.string().email()).default([]),
  bodyText: z.string().min(1).max(1_000_000),
  bodyHtml: z.string().max(1_000_000).nullable().optional().transform((v) => v ?? null),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/outbound')
@UseGuards(AuthGuard, ContractAccessGuard)
class OutboundController {
  constructor(@Inject(OutboundService) private readonly svc: OutboundService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: OutboundRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.list(contractId) };
  }

  @Post()
  async draft(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<OutboundRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = DraftBody.parse(rawBody);
    return this.svc.createDraft(principal, contractId, body, requireCorrelationId());
  }

  @Post(':outboundId/send')
  async send(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('outboundId') outboundId: string,
  ): Promise<OutboundRow> {
    requireRole(access, ['Owner', 'Administrator']);
    return this.svc.send(principal, outboundId, requireCorrelationId());
  }
}

@Module({
  controllers: [OutboundController],
  providers: [
    OutboundService,
    { provide: EMAIL_SENDER, useClass: ConsoleEmailSender },
  ],
  exports: [OutboundService],
})
export class OutboundModule {}
