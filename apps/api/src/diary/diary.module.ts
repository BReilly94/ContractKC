import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import { isDiaryEntryLocked, type DiarySyncState } from '@ckb/domain';
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

export interface SiteDiaryEntryRow {
  readonly id: string;
  readonly contractId: string;
  readonly authorUserId: string;
  readonly occurredAt: Date;
  readonly syncedAt: Date | null;
  readonly clientDraftId: string | null;
  readonly weather: string | null;
  readonly crewSummary: string | null;
  readonly equipmentSummary: string | null;
  readonly subcontractorSummary: string | null;
  readonly visitors: string | null;
  readonly incidentsSummary: string | null;
  readonly delaysSummary: string | null;
  readonly verbalInstructions: string | null;
  readonly freeNarrative: string | null;
  readonly tags: string | null;
  readonly syncState: DiarySyncState;
  readonly conflictOfEntryId: string | null;
  readonly conflictReconciledAt: Date | null;
  readonly locked: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  author_user_id: string;
  occurred_at: Date;
  synced_at: Date | null;
  client_draft_id: string | null;
  weather: string | null;
  crew_summary: string | null;
  equipment_summary: string | null;
  subcontractor_summary: string | null;
  visitors: string | null;
  incidents_summary: string | null;
  delays_summary: string | null;
  verbal_instructions: string | null;
  free_narrative: string | null;
  tags: string | null;
  sync_state: DiarySyncState;
  conflict_of_entry_id: string | null;
  conflict_reconciled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: DbRow): SiteDiaryEntryRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    authorUserId: r.author_user_id,
    occurredAt: r.occurred_at,
    syncedAt: r.synced_at,
    clientDraftId: r.client_draft_id,
    weather: r.weather,
    crewSummary: r.crew_summary,
    equipmentSummary: r.equipment_summary,
    subcontractorSummary: r.subcontractor_summary,
    visitors: r.visitors,
    incidentsSummary: r.incidents_summary,
    delaysSummary: r.delays_summary,
    verbalInstructions: r.verbal_instructions,
    freeNarrative: r.free_narrative,
    tags: r.tags,
    syncState: r.sync_state,
    conflictOfEntryId: r.conflict_of_entry_id,
    conflictReconciledAt: r.conflict_reconciled_at,
    locked: isDiaryEntryLocked(r.occurred_at),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT id, contract_id, author_user_id, occurred_at, synced_at,
         client_draft_id, weather, crew_summary, equipment_summary,
         subcontractor_summary, visitors, incidents_summary, delays_summary,
         verbal_instructions, free_narrative, tags, sync_state,
         conflict_of_entry_id, conflict_reconciled_at, created_at, updated_at
    FROM site_diary_entry
`;

export interface CreateDiaryInput {
  readonly occurredAt: string; // ISO 8601 — set on the client at creation moment
  readonly clientDraftId: string | null;
  readonly weather: string | null;
  readonly crewSummary: string | null;
  readonly equipmentSummary: string | null;
  readonly subcontractorSummary: string | null;
  readonly visitors: string | null;
  readonly incidentsSummary: string | null;
  readonly delaysSummary: string | null;
  readonly verbalInstructions: string | null;
  readonly freeNarrative: string | null;
  readonly tags: string | null;
}

export interface UpdateDiaryInput {
  readonly weather?: string | null | undefined;
  readonly crewSummary?: string | null | undefined;
  readonly equipmentSummary?: string | null | undefined;
  readonly subcontractorSummary?: string | null | undefined;
  readonly visitors?: string | null | undefined;
  readonly incidentsSummary?: string | null | undefined;
  readonly delaysSummary?: string | null | undefined;
  readonly verbalInstructions?: string | null | undefined;
  readonly freeNarrative?: string | null | undefined;
  readonly tags?: string | null | undefined;
}

@Injectable()
export class DiaryService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(
    contractId: string,
    options: { from?: string; to?: string } = {},
  ): Promise<SiteDiaryEntryRow[]> {
    const clauses = ['contract_id = @contract_id'];
    const req = this.pool.request().input('contract_id', mssql.Char(26), contractId);
    if (options.from) {
      clauses.push('occurred_at >= @from');
      req.input('from', mssql.DateTimeOffset, options.from);
    }
    if (options.to) {
      clauses.push('occurred_at <= @to');
      req.input('to', mssql.DateTimeOffset, options.to);
    }
    const r = await req.query<DbRow>(
      `${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC, created_at DESC`,
    );
    return r.recordset.map(mapRow);
  }

  async get(id: string): Promise<SiteDiaryEntryRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  /**
   * Create or idempotently re-accept a diary entry. Offline flow (§8.10b):
   * the client assigns a stable `clientDraftId` on creation; if the server
   * already has an entry with that draft id + author, return it unchanged
   * so retries after a partial sync do not create duplicates.
   */
  async create(
    principal: Principal,
    contractId: string,
    input: CreateDiaryInput,
    correlationId: string,
  ): Promise<SiteDiaryEntryRow> {
    if (input.clientDraftId) {
      const existing = await this.pool
        .request()
        .input('author', mssql.Char(26), principal.userId)
        .input('draft', mssql.VarChar(64), input.clientDraftId)
        .query<DbRow>(
          `${SELECT} WHERE author_user_id = @author AND client_draft_id = @draft`,
        );
      if (existing.recordset[0]) {
        return mapRow(existing.recordset[0]);
      }
    }

    const id = newUlid();
    const now = utcNow();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('author_user_id', mssql.Char(26), principal.userId)
        .input('occurred_at', mssql.DateTimeOffset, input.occurredAt)
        .input('synced_at', mssql.DateTimeOffset, now)
        .input('client_draft_id', mssql.VarChar(64), input.clientDraftId)
        .input('weather', mssql.NVarChar(512), input.weather)
        .input('crew_summary', mssql.NVarChar(mssql.MAX), input.crewSummary)
        .input('equipment_summary', mssql.NVarChar(mssql.MAX), input.equipmentSummary)
        .input('subcontractor_summary', mssql.NVarChar(mssql.MAX), input.subcontractorSummary)
        .input('visitors', mssql.NVarChar(mssql.MAX), input.visitors)
        .input('incidents_summary', mssql.NVarChar(mssql.MAX), input.incidentsSummary)
        .input('delays_summary', mssql.NVarChar(mssql.MAX), input.delaysSummary)
        .input('verbal_instructions', mssql.NVarChar(mssql.MAX), input.verbalInstructions)
        .input('free_narrative', mssql.NVarChar(mssql.MAX), input.freeNarrative)
        .input('tags', mssql.NVarChar(1024), input.tags)
        .query(`
          INSERT INTO site_diary_entry
            (id, contract_id, author_user_id, occurred_at, synced_at, client_draft_id,
             weather, crew_summary, equipment_summary, subcontractor_summary, visitors,
             incidents_summary, delays_summary, verbal_instructions, free_narrative, tags)
          VALUES
            (@id, @contract_id, @author_user_id, @occurred_at, @synced_at, @client_draft_id,
             @weather, @crew_summary, @equipment_summary, @subcontractor_summary, @visitors,
             @incidents_summary, @delays_summary, @verbal_instructions, @free_narrative, @tags);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'diary.create',
        entityType: 'SiteDiaryEntry',
        entityId: id,
        after: {
          contractId,
          occurredAt: input.occurredAt,
          clientDraftId: input.clientDraftId,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Diary entry disappeared after create');
    return row;
  }

  /**
   * NN #9 enforcement: edits rejected once the end-of-next-business-day
   * lock window has passed for `occurred_at`. After lock, users add a new
   * entry rather than editing.
   */
  async update(
    principal: Principal,
    id: string,
    input: UpdateDiaryInput,
    correlationId: string,
  ): Promise<SiteDiaryEntryRow> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError('Diary entry not found');
    if (current.authorUserId !== principal.userId) {
      throw new ValidationError('Only the original author may edit a diary entry');
    }
    if (isDiaryEntryLocked(current.occurredAt)) {
      throw new ConflictError(
        'Diary entry is locked (past end-of-next-business-day, NN #9). Add a new dated entry instead.',
      );
    }
    const sets: string[] = [];
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const req = new mssql.Request(tx).input('id', mssql.Char(26), id);
      const cols: Array<[keyof UpdateDiaryInput, string, mssql.ISqlType]> = [
        ['weather', 'weather', mssql.NVarChar(512)],
        ['crewSummary', 'crew_summary', mssql.NVarChar(mssql.MAX)],
        ['equipmentSummary', 'equipment_summary', mssql.NVarChar(mssql.MAX)],
        ['subcontractorSummary', 'subcontractor_summary', mssql.NVarChar(mssql.MAX)],
        ['visitors', 'visitors', mssql.NVarChar(mssql.MAX)],
        ['incidentsSummary', 'incidents_summary', mssql.NVarChar(mssql.MAX)],
        ['delaysSummary', 'delays_summary', mssql.NVarChar(mssql.MAX)],
        ['verbalInstructions', 'verbal_instructions', mssql.NVarChar(mssql.MAX)],
        ['freeNarrative', 'free_narrative', mssql.NVarChar(mssql.MAX)],
        ['tags', 'tags', mssql.NVarChar(1024)],
      ];
      for (const [key, col, type] of cols) {
        const value = input[key];
        if (value !== undefined) {
          sets.push(`${col} = @${col}`);
          req.input(col, type, value as unknown as never);
        }
      }
      if (sets.length === 0) {
        await tx.rollback();
        return current;
      }
      sets.push('updated_at = SYSDATETIMEOFFSET()');
      await req.query(`UPDATE site_diary_entry SET ${sets.join(', ')} WHERE id = @id;`);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'diary.update',
        entityType: 'SiteDiaryEntry',
        entityId: id,
        before: { occurredAt: current.occurredAt },
        after: input as Record<string, unknown>,
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(id);
    if (!updated) throw new Error('Diary entry disappeared after update');
    return updated;
  }
}

const CreateBody = z.object({
  occurredAt: z.string().datetime(),
  clientDraftId: z.string().max(64).nullable().optional().transform((v) => v ?? null),
  weather: z.string().max(512).nullable().optional().transform((v) => v ?? null),
  crewSummary: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  equipmentSummary: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  subcontractorSummary: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  visitors: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  incidentsSummary: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  delaysSummary: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  verbalInstructions: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  freeNarrative: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  tags: z.string().max(1024).nullable().optional().transform((v) => v ?? null),
});

const UpdateBody = z.object({
  weather: z.string().max(512).nullable().optional(),
  crewSummary: z.string().max(100_000).nullable().optional(),
  equipmentSummary: z.string().max(100_000).nullable().optional(),
  subcontractorSummary: z.string().max(100_000).nullable().optional(),
  visitors: z.string().max(100_000).nullable().optional(),
  incidentsSummary: z.string().max(100_000).nullable().optional(),
  delaysSummary: z.string().max(100_000).nullable().optional(),
  verbalInstructions: z.string().max(100_000).nullable().optional(),
  freeNarrative: z.string().max(100_000).nullable().optional(),
  tags: z.string().max(1024).nullable().optional(),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/diary')
@UseGuards(AuthGuard, ContractAccessGuard)
class DiaryController {
  constructor(@Inject(DiaryService) private readonly svc: DiaryService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: SiteDiaryEntryRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return {
      items: await this.svc.list(contractId, {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
    };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<SiteDiaryEntryRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Patch(':entryId')
  async update(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('entryId') entryId: string,
    @Body() rawBody: unknown,
  ): Promise<SiteDiaryEntryRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = UpdateBody.parse(rawBody);
    return this.svc.update(principal, entryId, body, requireCorrelationId());
  }
}

@Module({
  controllers: [DiaryController],
  providers: [DiaryService],
  exports: [DiaryService],
})
export class DiaryModule {}
