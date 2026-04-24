import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type {
  RecordFlagSeverity,
  RecordFlagTargetType,
  RecordFlagType,
} from '@ckb/domain';
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

export interface RecordFlagRow {
  readonly id: string;
  readonly contractId: string;
  readonly targetType: RecordFlagTargetType;
  readonly targetId: string;
  readonly flagType: RecordFlagType;
  readonly severity: RecordFlagSeverity | null;
  readonly holdPointName: string | null;
  readonly holdPointReleased: boolean | null;
  readonly notificationDueAt: Date | null;
  readonly deadlineId: string | null;
  readonly note: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  target_type: RecordFlagTargetType;
  target_id: string;
  flag_type: RecordFlagType;
  severity: RecordFlagSeverity | null;
  hold_point_name: string | null;
  hold_point_released: boolean | null;
  notification_due_at: Date | null;
  deadline_id: string | null;
  note: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: DbRow): RecordFlagRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    targetType: r.target_type,
    targetId: r.target_id,
    flagType: r.flag_type,
    severity: r.severity,
    holdPointName: r.hold_point_name,
    holdPointReleased: r.hold_point_released === null ? null : Boolean(r.hold_point_released),
    notificationDueAt: r.notification_due_at,
    deadlineId: r.deadline_id,
    note: r.note,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, target_type, target_id, flag_type, severity,
         hold_point_name, hold_point_released, notification_due_at, deadline_id,
         note, created_by_user_id, created_at, updated_at
    FROM record_flag
`;

@Injectable()
export class RecordFlagsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(
    contractId: string,
    options: { flagType?: RecordFlagType; targetType?: RecordFlagTargetType; targetId?: string } = {},
  ): Promise<RecordFlagRow[]> {
    const clauses = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (options.flagType) {
      clauses.push('flag_type = @flag_type');
      req.input('flag_type', mssql.VarChar(32), options.flagType);
    }
    if (options.targetType) {
      clauses.push('target_type = @target_type');
      req.input('target_type', mssql.VarChar(24), options.targetType);
    }
    if (options.targetId) {
      clauses.push('target_id = @target_id');
      req.input('target_id', mssql.Char(26), options.targetId);
    }
    const r = await req.query<DbRow>(
      `${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    );
    return r.recordset.map(mapRow);
  }

  async create(
    principal: Principal,
    contractId: string,
    input: {
      targetType: RecordFlagTargetType;
      targetId: string;
      flagType: RecordFlagType;
      severity: RecordFlagSeverity | null;
      holdPointName: string | null;
      notificationDueAt: string | null;
      note: string | null;
    },
    correlationId: string,
  ): Promise<RecordFlagRow> {
    const id = newUlid();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('target_type', mssql.VarChar(24), input.targetType)
        .input('target_id', mssql.Char(26), input.targetId)
        .input('flag_type', mssql.VarChar(32), input.flagType)
        .input('severity', mssql.VarChar(16), input.severity)
        .input('hold_point_name', mssql.NVarChar(256), input.holdPointName)
        .input('hold_point_released', mssql.Bit, input.flagType === 'HoldPointRelease' ? 0 : null)
        .input('notification_due_at', mssql.DateTimeOffset, input.notificationDueAt)
        .input('note', mssql.NVarChar(mssql.MAX), input.note)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO record_flag
            (id, contract_id, target_type, target_id, flag_type, severity,
             hold_point_name, hold_point_released, notification_due_at, note,
             created_by_user_id)
          VALUES
            (@id, @contract_id, @target_type, @target_id, @flag_type, @severity,
             @hold_point_name, @hold_point_released, @notification_due_at, @note,
             @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'record_flag.create',
        entityType: 'RecordFlag',
        entityId: id,
        after: {
          contractId,
          targetType: input.targetType,
          targetId: input.targetId,
          flagType: input.flagType,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    const row = r.recordset[0];
    if (!row) throw new Error('RecordFlag disappeared after create');
    return mapRow(row);
  }

  async releaseHoldPoint(
    principal: Principal,
    id: string,
    correlationId: string,
  ): Promise<RecordFlagRow> {
    const r0 = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    const current = r0.recordset[0];
    if (!current) throw new NotFoundError('Record flag not found');
    if (current.flag_type !== 'HoldPointRelease') {
      throw new NotFoundError('Flag is not a HoldPointRelease');
    }
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .query(
          `UPDATE record_flag SET hold_point_released = 1, updated_at = SYSDATETIMEOFFSET() WHERE id = @id;`,
        );
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'record_flag.hold_point.release',
        entityType: 'RecordFlag',
        entityId: id,
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return mapRow(r.recordset[0]!);
  }

  async delete(principal: Principal, id: string, correlationId: string): Promise<void> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx).input('id', mssql.Char(26), id).query('DELETE FROM record_flag WHERE id = @id');
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'record_flag.delete',
        entityType: 'RecordFlag',
        entityId: id,
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
  targetType: z.enum(['SiteDiaryEntry', 'Document', 'Email', 'Clause']),
  targetId: z.string().length(26),
  flagType: z.enum(['Incident', 'NCR', 'InspectionRecord', 'HoldPointRelease', 'CorrectiveAction', 'Observation']),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']).nullable().optional().transform((v) => v ?? null),
  holdPointName: z.string().max(256).nullable().optional().transform((v) => v ?? null),
  notificationDueAt: z.string().datetime().nullable().optional().transform((v) => v ?? null),
  note: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/record-flags')
@UseGuards(AuthGuard, ContractAccessGuard)
class RecordFlagsController {
  constructor(@Inject(RecordFlagsService) private readonly svc: RecordFlagsService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Query('flagType') flagType?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
  ): Promise<{ items: RecordFlagRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    const ftParsed = z.enum(['Incident', 'NCR', 'InspectionRecord', 'HoldPointRelease', 'CorrectiveAction', 'Observation']).safeParse(flagType);
    const ttParsed = z.enum(['SiteDiaryEntry', 'Document', 'Email', 'Clause']).safeParse(targetType);
    const options: Parameters<RecordFlagsService['list']>[1] = {};
    if (ftParsed.success) options.flagType = ftParsed.data;
    if (ttParsed.success) options.targetType = ttParsed.data;
    if (targetId) options.targetId = targetId;
    return { items: await this.svc.list(contractId, options) };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<RecordFlagRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Patch(':flagId/hold-point-release')
  async release(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('flagId') flagId: string,
  ): Promise<RecordFlagRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    return this.svc.releaseHoldPoint(principal, flagId, requireCorrelationId());
  }

  @Delete(':flagId')
  async delete(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('flagId') flagId: string,
  ): Promise<{ ok: true }> {
    requireRole(access, REGISTER_WRITE_ROLES);
    await this.svc.delete(principal, flagId, requireCorrelationId());
    return { ok: true };
  }
}

@Module({
  controllers: [RecordFlagsController],
  providers: [RecordFlagsService],
  exports: [RecordFlagsService],
})
export class RecordFlagsModule {}
