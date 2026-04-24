import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  UseGuards,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
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
import { SubmittalsService, type SubmittalRow } from './submittals.service.js';

const CreateBody = z.object({
  title: z.string().min(1).max(512),
  discipline: z.string().max(40).nullable().optional().transform((v) => v ?? null),
  workPackage: z.string().max(80).nullable().optional().transform((v) => v ?? null),
  description: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  previousSubmittalId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
  reviewClockDays: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
});

const TransitionBody = z.object({
  target: z.enum([
    'Draft', 'Submitted', 'UnderReview',
    'Approved', 'ApprovedAsNoted', 'ReviseAndResubmit', 'Rejected', 'Closed',
  ]),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/submittals')
@UseGuards(AuthGuard, ContractAccessGuard)
class SubmittalsController {
  constructor(@Inject(SubmittalsService) private readonly svc: SubmittalsService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: SubmittalRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.list(contractId) };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<SubmittalRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Post(':submittalId/transitions')
  async transition(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('submittalId') submittalId: string,
    @Body() rawBody: unknown,
  ): Promise<SubmittalRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = TransitionBody.parse(rawBody);
    return this.svc.transition(principal, submittalId, body.target, requireCorrelationId());
  }
}

@Module({
  controllers: [SubmittalsController],
  providers: [SubmittalsService],
  exports: [SubmittalsService],
})
export class SubmittalsModule {}
