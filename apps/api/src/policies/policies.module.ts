import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type { PolicyKind, PolicyRenewalResponsibility } from '@ckb/domain';
import { newUlid, NotFoundError, requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
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

export interface PolicyRow {
  readonly id: string;
  readonly contractId: string;
  readonly kind: PolicyKind;
  readonly typeDetail: string | null;
  readonly policyNumber: string | null;
  readonly issuer: string | null;
  readonly coverageAmountCents: number | null;
  readonly namedInsureds: string | null;
  readonly effectiveDate: string | null;
  readonly expiryDate: string | null;
  readonly renewalResponsibility: PolicyRenewalResponsibility | null;
  readonly preExpiryAlertDays: number;
  readonly notes: string | null;
  readonly deadlineId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  kind: PolicyKind;
  type_detail: string | null;
  policy_number: string | null;
  issuer: string | null;
  coverage_amount_cents: number | string | null;
  named_insureds: string | null;
  effective_date: Date | string | null;
  expiry_date: Date | string | null;
  renewal_responsibility: PolicyRenewalResponsibility | null;
  pre_expiry_alert_days: number;
  notes: string | null;
  deadline_id: string | null;
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

function mapRow(r: DbRow): PolicyRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    kind: r.kind,
    typeDetail: r.type_detail,
    policyNumber: r.policy_number,
    issuer: r.issuer,
    coverageAmountCents: asNumber(r.coverage_amount_cents),
    namedInsureds: r.named_insureds,
    effectiveDate: asIsoDate(r.effective_date),
    expiryDate: asIsoDate(r.expiry_date),
    renewalResponsibility: r.renewal_responsibility,
    preExpiryAlertDays: r.pre_expiry_alert_days,
    notes: r.notes,
    deadlineId: r.deadline_id,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, kind, type_detail, policy_number, issuer,
         coverage_amount_cents, named_insureds, effective_date, expiry_date,
         renewal_responsibility, pre_expiry_alert_days, notes, deadline_id,
         created_by_user_id, created_at, updated_at
    FROM policy
`;

export interface CreatePolicyInput {
  readonly kind: PolicyKind;
  readonly typeDetail: string | null;
  readonly policyNumber: string | null;
  readonly issuer: string | null;
  readonly coverageAmountCents: number | null;
  readonly namedInsureds: string | null;
  readonly effectiveDate: string | null;
  readonly expiryDate: string | null;
  readonly renewalResponsibility: PolicyRenewalResponsibility | null;
  readonly preExpiryAlertDays: number;
  readonly notes: string | null;
}

@Injectable()
export class PoliciesService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string, kind?: PolicyKind): Promise<PolicyRow[]> {
    const clauses = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (kind) {
      clauses.push('kind = @kind');
      req.input('kind', mssql.VarChar(16), kind);
    }
    const r = await req.query<DbRow>(
      `${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY expiry_date ASC, created_at DESC`,
    );
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<PolicyRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreatePolicyInput,
    correlationId: string,
  ): Promise<PolicyRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('kind', mssql.VarChar(16), input.kind)
        .input('type_detail', mssql.VarChar(80), input.typeDetail)
        .input('policy_number', mssql.NVarChar(128), input.policyNumber)
        .input('issuer', mssql.NVarChar(256), input.issuer)
        .input('coverage_amount_cents', mssql.BigInt, input.coverageAmountCents)
        .input('named_insureds', mssql.NVarChar(mssql.MAX), input.namedInsureds)
        .input('effective_date', mssql.Date, input.effectiveDate)
        .input('expiry_date', mssql.Date, input.expiryDate)
        .input('renewal_responsibility', mssql.VarChar(24), input.renewalResponsibility)
        .input('pre_expiry_alert_days', mssql.Int, input.preExpiryAlertDays)
        .input('notes', mssql.NVarChar(mssql.MAX), input.notes)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO policy
            (id, contract_id, kind, type_detail, policy_number, issuer,
             coverage_amount_cents, named_insureds, effective_date, expiry_date,
             renewal_responsibility, pre_expiry_alert_days, notes, created_by_user_id)
          VALUES
            (@id, @contract_id, @kind, @type_detail, @policy_number, @issuer,
             @coverage_amount_cents, @named_insureds, @effective_date, @expiry_date,
             @renewal_responsibility, @pre_expiry_alert_days, @notes, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'policy.create',
        entityType: 'Policy',
        entityId: id,
        after: { contractId, kind: input.kind, expiryDate: input.expiryDate },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Policy disappeared after create');
    return row;
  }

  async delete(
    principal: Principal,
    id: string,
    correlationId: string,
  ): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Policy not found');
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx).input('id', mssql.Char(26), id).query('DELETE FROM policy WHERE id = @id');
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'policy.delete',
        entityType: 'Policy',
        entityId: id,
        before: { kind: current.kind, expiryDate: current.expiryDate },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}

const CreateBody = z.object({
  kind: z.enum(['Insurance', 'Bond', 'Permit']),
  typeDetail: z.string().max(80).nullable().optional().transform((v) => v ?? null),
  policyNumber: z.string().max(128).nullable().optional().transform((v) => v ?? null),
  issuer: z.string().max(256).nullable().optional().transform((v) => v ?? null),
  coverageAmountCents: z.number().int().nonnegative().nullable().optional().transform((v) => v ?? null),
  namedInsureds: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((v) => v ?? null),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((v) => v ?? null),
  renewalResponsibility: z
    .enum(['Contractor', 'Client', 'Consultant', 'Subcontractor', 'Other'])
    .nullable().optional().transform((v) => v ?? null),
  preExpiryAlertDays: z.number().int().nonnegative().default(30),
  notes: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/policies')
@UseGuards(AuthGuard, ContractAccessGuard)
class PoliciesController {
  constructor(@Inject(PoliciesService) private readonly svc: PoliciesService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Query('kind') kind?: string,
  ): Promise<{ items: PolicyRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    const kindParsed = z.enum(['Insurance', 'Bond', 'Permit']).safeParse(kind);
    return {
      items: await this.svc.list(contractId, kindParsed.success ? kindParsed.data : undefined),
    };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<PolicyRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Delete(':policyId')
  async delete(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('policyId') policyId: string,
  ): Promise<{ ok: true }> {
    requireRole(access, REGISTER_WRITE_ROLES);
    await this.svc.delete(principal, policyId, requireCorrelationId());
    return { ok: true };
  }
}

@Module({
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
