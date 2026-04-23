import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ContractAccessService } from '../common/access.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { DeadlinesService, type DeadlineRow } from './deadlines.service.js';

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined => {
    return ctx.switchToHttp().getRequest<ContractAccessRequest>().access;
  },
);

const CreateBody = z.object({
  label: z.string().min(1).max(512),
  responsibleParty: z.enum(['Contractor', 'Client', 'Consultant', 'Other']),
  triggerCondition: z.string().max(1024).nullable().optional(),
  durationDays: z.number().int().nonnegative().nullable().optional(),
  absoluteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  alertLeadDays: z.number().int().nonnegative().default(3),
  consequence: z.string().max(1024).nullable().optional(),
  sourceType: z.enum(['Clause', 'Email', 'Document', 'CalendarEvent', 'Manual', 'MeetingMinutes']).default('Manual'),
  sourceId: z.string().length(26).nullable().optional(),
  sourceCitation: z.string().max(256).nullable().optional(),
});

const TransitionBody = z.object({
  to: z.enum(['Verified', 'Active', 'Triggered', 'Complete', 'Missed', 'Cancelled']),
});

@Controller('api/contracts/:id/deadlines')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractDeadlinesController {
  constructor(@Inject(DeadlinesService) private readonly service: DeadlinesService) {}

  @Get()
  async list(
    @Param('id') contractId: string,
    @Query('verificationState') verificationState?: string,
    @Query('lifecycleState') lifecycleState?: string,
  ): Promise<DeadlineRow[]> {
    const options: Parameters<DeadlinesService['listForContract']>[1] = {};
    if (verificationState === 'Unverified' || verificationState === 'Verified') {
      options.verificationState = verificationState;
    }
    if (
      lifecycleState === 'Extracted' ||
      lifecycleState === 'Verified' ||
      lifecycleState === 'Active' ||
      lifecycleState === 'Triggered' ||
      lifecycleState === 'Complete' ||
      lifecycleState === 'Missed' ||
      lifecycleState === 'Cancelled'
    ) {
      options.lifecycleState = lifecycleState;
    }
    return this.service.listForContract(contractId, options);
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<DeadlineRow> {
    const body = CreateBody.parse(rawBody);
    return this.service.create(
      principal,
      contractId,
      {
        label: body.label,
        responsibleParty: body.responsibleParty,
        triggerCondition: body.triggerCondition ?? null,
        durationDays: body.durationDays ?? null,
        absoluteDate: body.absoluteDate ?? null,
        alertLeadDays: body.alertLeadDays,
        consequence: body.consequence ?? null,
        sourceType: body.sourceType,
        sourceId: body.sourceId ?? null,
        sourceCitation: body.sourceCitation ?? null,
        extractedByCapabilityVersion: null,
      },
      requireCorrelationId(),
    );
  }
}

@Controller('api/deadlines')
@UseGuards(AuthGuard)
export class DeadlinesController {
  constructor(
    @Inject(DeadlinesService) private readonly service: DeadlinesService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Get(':id')
  async get(@GetPrincipal() principal: Principal, @Param('id') id: string): Promise<DeadlineRow> {
    const d = await this.service.get(id);
    if (!d) throw new NotFoundException('Deadline not found');
    await this.access.assertAccess(principal, d.contractId);
    return d;
  }

  @Post(':id/verify')
  async verify(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<DeadlineRow> {
    const d = await this.service.get(id);
    if (!d) throw new NotFoundException('Deadline not found');
    const role = await this.access.assertAccess(principal, d.contractId);
    return this.service.verify(principal, id, role, requireCorrelationId());
  }

  @Patch(':id/transition')
  async transition(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<DeadlineRow> {
    const d = await this.service.get(id);
    if (!d) throw new NotFoundException('Deadline not found');
    await this.access.assertAccess(principal, d.contractId);
    const body = TransitionBody.parse(rawBody);
    return this.service.transition(principal, id, body.to, requireCorrelationId());
  }
}

// keep import util silent when unused in future
void GetAccess;
