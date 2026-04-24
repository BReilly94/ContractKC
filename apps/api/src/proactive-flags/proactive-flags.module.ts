import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type {
  ProactiveFlag,
  ProactiveFlagKind,
  ProactiveFlagStatus,
  ProactiveFlagTriggerType,
  FlagSensitivityProfile,
} from '@ckb/domain';
import { isLegalProactiveFlagTransition } from '@ckb/domain';
import {
  ConflictError,
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
import {
  REGISTER_READ_ROLES,
  REGISTER_WRITE_ROLES,
} from '../common/register-helpers.js';
import { DB_POOL } from '../common/tokens.js';

/**
 * Proactive AI Flagging REST (Slice GG, §6.15).
 *
 * Read + action endpoints only — flags are raised by the background
 * pipeline (apps/workers/src/workers/proactive-flagger.ts). No POST
 * create: a user cannot conjure a flag.
 */

interface DbRow {
  id: string;
  contract_id: string;
  trigger_event_type: ProactiveFlagTriggerType;
  trigger_event_id: string;
  flag_kind: ProactiveFlagKind;
  reasoning: string;
  cited_clause_ids: string;
  cited_chunk_ids: string;
  recommended_action: string;
  status: ProactiveFlagStatus;
  actioned_by_user_id: string | null;
  actioned_at: Date | null;
  action_note: string | null;
  first_pass_model: string;
  deep_review_model: string | null;
  sensitivity_profile: FlagSensitivityProfile;
  created_at: Date;
  updated_at: Date;
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* fall through */
  }
  return [];
}

function mapRow(r: DbRow): ProactiveFlag {
  return {
    id: r.id as ProactiveFlag['id'],
    contractId: r.contract_id as ProactiveFlag['contractId'],
    triggerEventType: r.trigger_event_type,
    triggerEventId: r.trigger_event_id,
    flagKind: r.flag_kind,
    reasoning: r.reasoning,
    citedClauseIds: parseIds(r.cited_clause_ids),
    citedChunkIds: parseIds(r.cited_chunk_ids),
    recommendedAction: r.recommended_action,
    status: r.status,
    actionedByUserId: (r.actioned_by_user_id as ProactiveFlag['actionedByUserId']) ?? null,
    actionedAt: r.actioned_at,
    actionNote: r.action_note,
    firstPassModel: r.first_pass_model,
    deepReviewModel: r.deep_review_model,
    sensitivityProfile: r.sensitivity_profile,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, trigger_event_type, trigger_event_id, flag_kind,
         reasoning, cited_clause_ids, cited_chunk_ids, recommended_action,
         status, actioned_by_user_id, actioned_at, action_note,
         first_pass_model, deep_review_model, sensitivity_profile,
         created_at, updated_at
    FROM proactive_flag
`;

@Injectable()
export class ProactiveFlagsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(
    contractId: string,
    options: {
      status?: ProactiveFlagStatus;
      flagKind?: ProactiveFlagKind;
    } = {},
  ): Promise<ProactiveFlag[]> {
    const clauses = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (options.status) {
      clauses.push('status = @status');
      req.input('status', mssql.VarChar(16), options.status);
    }
    if (options.flagKind) {
      clauses.push('flag_kind = @flag_kind');
      req.input('flag_kind', mssql.VarChar(32), options.flagKind);
    }
    const r = await req.query<DbRow>(
      `${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    );
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<ProactiveFlag | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    const row = r.recordset[0];
    return row ? mapRow(row) : null;
  }

  async transition(
    principal: Principal,
    id: string,
    target: Exclude<ProactiveFlagStatus, 'New'>,
    note: string | null,
    correlationId: string,
  ): Promise<ProactiveFlag> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Proactive flag not found');
    if (!isLegalProactiveFlagTransition(current.status, target)) {
      throw new ConflictError(
        `Illegal proactive flag transition: ${current.status} → ${target}`,
        { from: current.status, to: target },
      );
    }
    const action =
      target === 'Actioned'
        ? 'proactive_flag.action'
        : target === 'Dismissed'
          ? 'proactive_flag.dismiss'
          : 'proactive_flag.escalate';

    const now = utcNow();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const update = await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('status', mssql.VarChar(16), target)
        .input('actioned_by_user_id', mssql.Char(26), principal.userId)
        .input('actioned_at', mssql.DateTimeOffset, now)
        .input('action_note', mssql.NVarChar(2048), note)
        .input('current_status', mssql.VarChar(16), current.status)
        .query(`
          UPDATE proactive_flag
             SET status = @status,
                 actioned_by_user_id = @actioned_by_user_id,
                 actioned_at = @actioned_at,
                 action_note = @action_note,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id AND status = @current_status;
        `);
      if (update.rowsAffected[0] === 0) {
        throw new ConflictError('Concurrent transition detected');
      }
      await logAudit(tx, {
        actorUserId: principal.userId,
        action,
        entityType: 'ProactiveFlag',
        entityId: id,
        before: { status: current.status },
        after: { status: target, note },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Flag disappeared after transition');
    return updated;
  }
}

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

const ActionBody = z.object({
  action: z.enum(['Actioned', 'Dismissed', 'Escalated']),
  note: z
    .string()
    .max(2048)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

@Controller('api/contracts/:id/proactive-flags')
@UseGuards(AuthGuard, ContractAccessGuard)
class ProactiveFlagsController {
  constructor(@Inject(ProactiveFlagsService) private readonly svc: ProactiveFlagsService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Query('status') status?: string,
    @Query('flagKind') flagKind?: string,
  ): Promise<{ items: ProactiveFlag[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    const statusParsed = z
      .enum(['New', 'Actioned', 'Dismissed', 'Escalated'])
      .safeParse(status);
    const kindParsed = z
      .enum([
        'PossibleNotice',
        'SuspectedScopeChange',
        'DeadlineImminentNoPrep',
        'RevisionScopeImpact',
        'Other',
      ])
      .safeParse(flagKind);
    const options: Parameters<ProactiveFlagsService['list']>[1] = {};
    if (statusParsed.success) options.status = statusParsed.data;
    if (kindParsed.success) options.flagKind = kindParsed.data;
    return { items: await this.svc.list(contractId, options) };
  }

  @Patch(':flagId/action')
  async action(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('flagId') flagId: string,
    @Body() rawBody: unknown,
  ): Promise<ProactiveFlag> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = ActionBody.parse(rawBody);
    return this.svc.transition(
      principal,
      flagId,
      body.action,
      body.note,
      requireCorrelationId(),
    );
  }
}

@Module({
  controllers: [ProactiveFlagsController],
  providers: [ProactiveFlagsService],
  exports: [ProactiveFlagsService],
})
export class ProactiveFlagsModule {}
