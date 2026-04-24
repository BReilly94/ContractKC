import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  isLegalPaymentApplicationTransition,
  type PaymentApplicationStatus,
} from '@ckb/domain';
import {
  ConflictError,
  newUlid,
  NotFoundError,
  requireCorrelationId,
  utcNow,
} from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Patch,
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
import { REGISTER_READ_ROLES, REGISTER_WRITE_ROLES, nextContractSequence } from '../common/register-helpers.js';
import { DB_POOL } from '../common/tokens.js';

export interface PaymentApplicationRow {
  readonly id: string;
  readonly contractId: string;
  readonly applicationNumber: number | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly claimedAmountCents: number | null;
  readonly certifiedAmountCents: number | null;
  readonly paidAmountCents: number | null;
  readonly disputedAmountCents: number | null;
  readonly status: PaymentApplicationStatus;
  readonly submittedAt: Date | null;
  readonly certificationDueAt: Date | null;
  readonly certifiedAt: Date | null;
  readonly paymentDueAt: Date | null;
  readonly paidAt: Date | null;
  readonly notes: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  application_number: number | null;
  period_start: Date | string | null;
  period_end: Date | string | null;
  claimed_amount_cents: number | string | null;
  certified_amount_cents: number | string | null;
  paid_amount_cents: number | string | null;
  disputed_amount_cents: number | string | null;
  status: PaymentApplicationStatus;
  submitted_at: Date | null;
  certification_due_at: Date | null;
  certified_at: Date | null;
  payment_due_at: Date | null;
  paid_at: Date | null;
  notes: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function asIsoDate(v: Date | string | null): string | null {
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v.length >= 10 ? v.slice(0, 10) : v;
}
function asNumber(v: number | string | null): number | null {
  if (v === null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function mapRow(r: DbRow): PaymentApplicationRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    applicationNumber: r.application_number,
    periodStart: asIsoDate(r.period_start),
    periodEnd: asIsoDate(r.period_end),
    claimedAmountCents: asNumber(r.claimed_amount_cents),
    certifiedAmountCents: asNumber(r.certified_amount_cents),
    paidAmountCents: asNumber(r.paid_amount_cents),
    disputedAmountCents: asNumber(r.disputed_amount_cents),
    status: r.status,
    submittedAt: r.submitted_at,
    certificationDueAt: r.certification_due_at,
    certifiedAt: r.certified_at,
    paymentDueAt: r.payment_due_at,
    paidAt: r.paid_at,
    notes: r.notes,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, application_number, period_start, period_end,
         claimed_amount_cents, certified_amount_cents, paid_amount_cents,
         disputed_amount_cents, status, submitted_at, certification_due_at,
         certified_at, payment_due_at, paid_at, notes,
         created_by_user_id, created_at, updated_at
    FROM payment_application
`;

@Injectable()
export class PaymentsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string): Promise<PaymentApplicationRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY application_number DESC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<PaymentApplicationRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: {
      periodStart: string | null;
      periodEnd: string | null;
      claimedAmountCents: number | null;
      notes: string | null;
    },
    correlationId: string,
  ): Promise<PaymentApplicationRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const applicationNumber = await nextContractSequence(
        tx,
        'payment_application',
        'application_number',
        contractId,
      );
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('application_number', mssql.Int, applicationNumber)
        .input('period_start', mssql.Date, input.periodStart)
        .input('period_end', mssql.Date, input.periodEnd)
        .input('claimed_amount_cents', mssql.BigInt, input.claimedAmountCents)
        .input('notes', mssql.NVarChar(mssql.MAX), input.notes)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO payment_application
            (id, contract_id, application_number, period_start, period_end,
             claimed_amount_cents, notes, created_by_user_id)
          VALUES
            (@id, @contract_id, @application_number, @period_start, @period_end,
             @claimed_amount_cents, @notes, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'payment_application.create',
        entityType: 'PaymentApplication',
        entityId: id,
        after: { contractId, applicationNumber, claimedAmountCents: input.claimedAmountCents },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('PaymentApplication disappeared after create');
    return row;
  }

  async transition(
    principal: Principal,
    id: string,
    target: PaymentApplicationStatus,
    amounts: {
      certifiedAmountCents?: number | undefined;
      paidAmountCents?: number | undefined;
      disputedAmountCents?: number | undefined;
    },
    correlationId: string,
  ): Promise<PaymentApplicationRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Payment application not found');
    if (!isLegalPaymentApplicationTransition(current.status, target)) {
      throw new ConflictError(
        `Illegal payment transition: ${current.status} → ${target}`,
      );
    }
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('status', mssql.VarChar(24), target);
      const sets = ['status = @status', 'updated_at = SYSDATETIMEOFFSET()'];
      const now = utcNow();
      if (target === 'Submitted') {
        req.input('now', mssql.DateTimeOffset, now);
        sets.push('submitted_at = @now');
      } else if (target === 'Certified' && amounts.certifiedAmountCents !== undefined) {
        req.input('now', mssql.DateTimeOffset, now);
        req.input('certified_amount_cents', mssql.BigInt, amounts.certifiedAmountCents);
        sets.push('certified_at = @now', 'certified_amount_cents = @certified_amount_cents');
      } else if (target === 'Paid' && amounts.paidAmountCents !== undefined) {
        req.input('now', mssql.DateTimeOffset, now);
        req.input('paid_amount_cents', mssql.BigInt, amounts.paidAmountCents);
        sets.push('paid_at = @now', 'paid_amount_cents = @paid_amount_cents');
      } else if (target === 'Disputed' && amounts.disputedAmountCents !== undefined) {
        req.input('disputed_amount_cents', mssql.BigInt, amounts.disputedAmountCents);
        sets.push('disputed_amount_cents = @disputed_amount_cents');
      }
      await req.query(`
        UPDATE payment_application SET ${sets.join(', ')}
         WHERE id = @id AND status = '${current.status}';
      `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'payment_application.transition',
        entityType: 'PaymentApplication',
        entityId: id,
        before: { status: current.status },
        after: { status: target, ...amounts },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('PaymentApplication disappeared after transition');
    return updated;
  }
}

const CreateBody = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((v) => v ?? null),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((v) => v ?? null),
  claimedAmountCents: z.number().int().nonnegative().nullable().optional().transform((v) => v ?? null),
  notes: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
});

const TransitionBody = z.object({
  target: z.enum(['Draft', 'Submitted', 'Certified', 'Paid', 'Disputed', 'Closed']),
  certifiedAmountCents: z.number().int().nonnegative().optional(),
  paidAmountCents: z.number().int().nonnegative().optional(),
  disputedAmountCents: z.number().int().nonnegative().optional(),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/payment-applications')
@UseGuards(AuthGuard, ContractAccessGuard)
class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly svc: PaymentsService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: PaymentApplicationRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.list(contractId) };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<PaymentApplicationRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Patch(':paymentId/transitions')
  async transition(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('paymentId') paymentId: string,
    @Body() rawBody: unknown,
  ): Promise<PaymentApplicationRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = TransitionBody.parse(rawBody);
    return this.svc.transition(
      principal,
      paymentId,
      body.target,
      {
        ...(body.certifiedAmountCents !== undefined ? { certifiedAmountCents: body.certifiedAmountCents } : {}),
        ...(body.paidAmountCents !== undefined ? { paidAmountCents: body.paidAmountCents } : {}),
        ...(body.disputedAmountCents !== undefined ? { disputedAmountCents: body.disputedAmountCents } : {}),
      },
      requireCorrelationId(),
    );
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
