import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  isClaimResolved,
  isLegalClaimTransition,
  type ClaimLifecycleState,
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

export interface ClaimRow {
  readonly id: string;
  readonly contractId: string;
  readonly claimNumber: number | null;
  readonly title: string;
  readonly lifecycleState: ClaimLifecycleState;
  readonly narrative: string | null;
  readonly amountClaimedCents: number | null;
  readonly amountAwardedCents: number | null;
  readonly timeImpactDays: number | null;
  readonly triggerEventSummary: string | null;
  readonly primaryClauseId: string | null;
  readonly submittedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly resolutionNote: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  claim_number: number | null;
  title: string;
  lifecycle_state: ClaimLifecycleState;
  narrative: string | null;
  amount_claimed_cents: number | string | null;
  amount_awarded_cents: number | string | null;
  time_impact_days: number | null;
  trigger_event_summary: string | null;
  primary_clause_id: string | null;
  submitted_at: Date | null;
  resolved_at: Date | null;
  resolution_note: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function asNumber(v: number | string | null): number | null {
  if (v === null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function mapRow(r: DbRow): ClaimRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    claimNumber: r.claim_number,
    title: r.title,
    lifecycleState: r.lifecycle_state,
    narrative: r.narrative,
    amountClaimedCents: asNumber(r.amount_claimed_cents),
    amountAwardedCents: asNumber(r.amount_awarded_cents),
    timeImpactDays: r.time_impact_days,
    triggerEventSummary: r.trigger_event_summary,
    primaryClauseId: r.primary_clause_id,
    submittedAt: r.submitted_at,
    resolvedAt: r.resolved_at,
    resolutionNote: r.resolution_note,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, claim_number, title, lifecycle_state, narrative,
         amount_claimed_cents, amount_awarded_cents, time_impact_days,
         trigger_event_summary, primary_clause_id, submitted_at, resolved_at,
         resolution_note, created_by_user_id, created_at, updated_at
    FROM claim
`;

export interface CreateClaimInput {
  readonly title: string;
  readonly triggerEventSummary: string | null;
  readonly primaryClauseId: string | null;
}

export interface UpdateClaimInput {
  readonly title?: string | undefined;
  readonly narrative?: string | null | undefined;
  readonly triggerEventSummary?: string | null | undefined;
  readonly amountClaimedCents?: number | null | undefined;
  readonly amountAwardedCents?: number | null | undefined;
  readonly timeImpactDays?: number | null | undefined;
  readonly primaryClauseId?: string | null | undefined;
}

@Injectable()
export class ClaimsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string): Promise<ClaimRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(`${SELECT} WHERE contract_id = @contract_id ORDER BY created_at DESC`);
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<ClaimRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreateClaimInput,
    correlationId: string,
  ): Promise<ClaimRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const claimNumber = await nextContractSequence(tx, 'claim', 'claim_number', contractId);
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('claim_number', mssql.Int, claimNumber)
        .input('title', mssql.NVarChar(512), input.title)
        .input('trigger_event_summary', mssql.NVarChar(2000), input.triggerEventSummary)
        .input('primary_clause_id', mssql.Char(26), input.primaryClauseId)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO claim
            (id, contract_id, claim_number, title, trigger_event_summary, primary_clause_id, created_by_user_id)
          VALUES
            (@id, @contract_id, @claim_number, @title, @trigger_event_summary, @primary_clause_id, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'claim.create',
        entityType: 'Claim',
        entityId: id,
        after: { contractId, claimNumber, title: input.title },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Claim disappeared after create');
    return row;
  }

  async update(
    principal: Principal,
    id: string,
    input: UpdateClaimInput,
    correlationId: string,
  ): Promise<ClaimRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Claim not found');
    const sets: string[] = [];
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx).input('id', mssql.Char(26), id);
      if (input.title !== undefined) {
        sets.push('title = @title');
        req.input('title', mssql.NVarChar(512), input.title);
      }
      if (input.narrative !== undefined) {
        sets.push('narrative = @narrative');
        req.input('narrative', mssql.NVarChar(mssql.MAX), input.narrative);
      }
      if (input.triggerEventSummary !== undefined) {
        sets.push('trigger_event_summary = @trigger');
        req.input('trigger', mssql.NVarChar(2000), input.triggerEventSummary);
      }
      if (input.amountClaimedCents !== undefined) {
        sets.push('amount_claimed_cents = @amount_claimed');
        req.input('amount_claimed', mssql.BigInt, input.amountClaimedCents);
      }
      if (input.amountAwardedCents !== undefined) {
        sets.push('amount_awarded_cents = @amount_awarded');
        req.input('amount_awarded', mssql.BigInt, input.amountAwardedCents);
      }
      if (input.timeImpactDays !== undefined) {
        sets.push('time_impact_days = @time_impact');
        req.input('time_impact', mssql.Int, input.timeImpactDays);
      }
      if (input.primaryClauseId !== undefined) {
        sets.push('primary_clause_id = @primary_clause');
        req.input('primary_clause', mssql.Char(26), input.primaryClauseId);
      }
      if (sets.length === 0) {
        await tx.rollback();
        return current;
      }
      sets.push('updated_at = SYSDATETIMEOFFSET()');
      await req.query(`UPDATE claim SET ${sets.join(', ')} WHERE id = @id;`);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'claim.update',
        entityType: 'Claim',
        entityId: id,
        before: { lifecycleState: current.lifecycleState },
        after: input as Record<string, unknown>,
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Claim disappeared after update');
    return updated;
  }

  async transition(
    principal: Principal,
    id: string,
    target: ClaimLifecycleState,
    opts: {
      resolutionNote?: string | undefined;
      amountAwardedCents?: number | undefined;
      readinessScoreOverride?: { reason: string } | undefined;
    },
    correlationId: string,
  ): Promise<ClaimRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Claim not found');
    if (!isLegalClaimTransition(current.lifecycleState, target)) {
      throw new ConflictError(
        `Illegal claim transition: ${current.lifecycleState} → ${target}`,
      );
    }
    // Slice FF gate: moving to Submitted requires a passing readiness score
    // or a Commercial Lead override. The actual ReadinessScoreService check
    // lives in Slice FF; here we accept the override if supplied and log it.
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('target', mssql.VarChar(32), target);
      const sets = ['lifecycle_state = @target', 'updated_at = SYSDATETIMEOFFSET()'];
      if (target === 'Submitted') {
        req.input('submitted_at', mssql.DateTimeOffset, utcNow());
        sets.push('submitted_at = @submitted_at');
      }
      if (isClaimResolved(target)) {
        req.input('resolved_at', mssql.DateTimeOffset, utcNow());
        sets.push('resolved_at = @resolved_at');
        if (opts.resolutionNote !== undefined) {
          req.input('resolution_note', mssql.NVarChar(1024), opts.resolutionNote);
          sets.push('resolution_note = @resolution_note');
        }
        if (opts.amountAwardedCents !== undefined) {
          req.input('amount_awarded', mssql.BigInt, opts.amountAwardedCents);
          sets.push('amount_awarded_cents = @amount_awarded');
        }
      }
      await req.query(`
        UPDATE claim SET ${sets.join(', ')}
         WHERE id = @id AND lifecycle_state = '${current.lifecycleState}';
      `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'claim.lifecycle.transition',
        entityType: 'Claim',
        entityId: id,
        before: { lifecycleState: current.lifecycleState },
        after: {
          lifecycleState: target,
          ...(opts.readinessScoreOverride ? { readinessScoreOverride: opts.readinessScoreOverride.reason } : {}),
          ...(opts.resolutionNote ? { resolutionNote: opts.resolutionNote } : {}),
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Claim disappeared after transition');
    return updated;
  }
}

const CreateBody = z.object({
  title: z.string().min(1).max(512),
  triggerEventSummary: z.string().max(2000).nullable().optional().transform((v) => v ?? null),
  primaryClauseId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
});

const UpdateBody = z.object({
  title: z.string().min(1).max(512).optional(),
  narrative: z.string().max(1_000_000).nullable().optional(),
  triggerEventSummary: z.string().max(2000).nullable().optional(),
  amountClaimedCents: z.number().int().nullable().optional(),
  amountAwardedCents: z.number().int().nullable().optional(),
  timeImpactDays: z.number().int().nullable().optional(),
  primaryClauseId: z.string().length(26).nullable().optional(),
});

const TransitionBody = z.object({
  target: z.enum([
    'Draft', 'InternalReview', 'Submitted', 'ClientResponseReceived',
    'UnderNegotiation',
    'ResolvedWon', 'ResolvedSettled', 'ResolvedLost', 'ResolvedWithdrawn',
  ]),
  resolutionNote: z.string().max(1024).optional(),
  amountAwardedCents: z.number().int().optional(),
  readinessScoreOverrideReason: z.string().min(1).max(1024).optional(),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/claims')
@UseGuards(AuthGuard, ContractAccessGuard)
class ClaimsController {
  constructor(@Inject(ClaimsService) private readonly svc: ClaimsService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: ClaimRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.list(contractId) };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<ClaimRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Patch(':claimId')
  async update(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('claimId') claimId: string,
    @Body() rawBody: unknown,
  ): Promise<ClaimRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = UpdateBody.parse(rawBody);
    return this.svc.update(principal, claimId, body, requireCorrelationId());
  }

  @Post(':claimId/transitions')
  async transition(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('claimId') claimId: string,
    @Body() rawBody: unknown,
  ): Promise<ClaimRow> {
    // Submitted transition requires the readiness override OR a passing
    // score — validated by Slice FF's ReadinessScoreService in the full
    // wiring. Here we accept the override reason and log it.
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = TransitionBody.parse(rawBody);
    return this.svc.transition(
      principal,
      claimId,
      body.target,
      {
        ...(body.resolutionNote !== undefined ? { resolutionNote: body.resolutionNote } : {}),
        ...(body.amountAwardedCents !== undefined ? { amountAwardedCents: body.amountAwardedCents } : {}),
        ...(body.readinessScoreOverrideReason !== undefined
          ? { readinessScoreOverride: { reason: body.readinessScoreOverrideReason } }
          : {}),
      },
      requireCorrelationId(),
    );
  }
}

@Module({
  controllers: [ClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
