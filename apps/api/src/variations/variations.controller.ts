import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
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
import { VariationsService, type VariationRow } from './variations.service.js';

const CreateBody = z.object({
  title: z.string().min(1).max(512),
  description: z.string().max(100_000).nullable().optional().transform((v) => v ?? null),
  originatingInstruction: z.string().max(1024).nullable().optional().transform((v) => v ?? null),
});

const UpdateBody = z.object({
  title: z.string().min(1).max(512).optional(),
  description: z.string().max(100_000).nullable().optional(),
  originatingInstruction: z.string().max(1024).nullable().optional(),
  pricedAmountCents: z.number().int().nullable().optional(),
  approvedAmountCents: z.number().int().nullable().optional(),
});

const TransitionBody = z.object({
  target: z.enum(['Proposed', 'Priced', 'Submitted', 'Approved', 'Rejected', 'Disputed', 'Closed']),
});

const LinkBody = z.object({
  kind: z.enum(['clause', 'email', 'document', 'claim']),
  targetId: z.string().length(26),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined => {
    return ctx.switchToHttp().getRequest<ContractAccessRequest>().access;
  },
);

@Controller('api/contracts/:id/variations')
@UseGuards(AuthGuard, ContractAccessGuard)
export class VariationsController {
  constructor(@Inject(VariationsService) private readonly svc: VariationsService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: VariationRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.list(contractId) };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<VariationRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Patch(':variationId')
  async update(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('variationId') variationId: string,
    @Body() rawBody: unknown,
  ): Promise<VariationRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = UpdateBody.parse(rawBody);
    return this.svc.update(principal, variationId, body, requireCorrelationId());
  }

  @Post(':variationId/transitions')
  async transition(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('variationId') variationId: string,
    @Body() rawBody: unknown,
  ): Promise<VariationRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = TransitionBody.parse(rawBody);
    return this.svc.transition(principal, variationId, body.target, requireCorrelationId());
  }

  @Post(':variationId/links')
  async link(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('variationId') variationId: string,
    @Body() rawBody: unknown,
  ): Promise<{ ok: true }> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = LinkBody.parse(rawBody);
    await this.svc.link(
      principal,
      variationId,
      { kind: body.kind, id: body.targetId },
      requireCorrelationId(),
    );
    return { ok: true };
  }

  @Get(':variationId/links')
  async listLinks(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('variationId') variationId: string,
  ) {
    requireRole(access, REGISTER_READ_ROLES);
    return this.svc.listLinks(variationId);
  }
}
