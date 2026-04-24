import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import type { RiskStatus } from '@ckb/domain';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
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
import { RisksService, type RiskRow } from './risks.service.js';

const Likelihood = z.enum(['Low', 'Medium', 'High']);
const Category = z.enum([
  'Commercial', 'Schedule', 'Technical', 'Safety', 'Regulatory',
  'Environmental', 'ClientBehaviour', 'Subcontractor', 'ForceMAjeure', 'Other',
]);
const Status = z.enum(['Open', 'Mitigated', 'Occurred', 'Closed']);

const CreateBody = z.object({
  title: z.string().min(1).max(512),
  description: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  category: Category,
  ownerUserId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
  probability: Likelihood,
  impact: Likelihood,
  mitigation: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
});

const UpdateBody = z.object({
  title: z.string().min(1).max(512).optional(),
  description: z.string().max(100_000).nullable().optional(),
  category: Category.optional(),
  ownerUserId: z.string().length(26).nullable().optional(),
  probability: Likelihood.optional(),
  impact: Likelihood.optional(),
  mitigation: z.string().max(100_000).nullable().optional(),
  residualProbability: Likelihood.nullable().optional(),
  residualImpact: Likelihood.nullable().optional(),
  status: Status.optional(),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/risks')
@UseGuards(AuthGuard, ContractAccessGuard)
export class RisksController {
  constructor(@Inject(RisksService) private readonly svc: RisksService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Query('status') status?: string,
  ): Promise<{ items: RiskRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    const validStatus = Status.safeParse(status);
    return {
      items: await this.svc.list(contractId, validStatus.success ? (validStatus.data as RiskStatus) : undefined),
    };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<RiskRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Patch(':riskId')
  async update(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('riskId') riskId: string,
    @Body() rawBody: unknown,
  ): Promise<RiskRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = UpdateBody.parse(rawBody);
    return this.svc.update(principal, riskId, body, requireCorrelationId());
  }
}
