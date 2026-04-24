import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
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
import {
  InterpretationsService,
  type InterpretationRow,
} from './interpretations.service.js';

const CreateBody = z.object({
  title: z.string().min(1).max(512),
  context: z.string().min(1).max(100_000),
  decision: z.string().min(1).max(100_000),
  decidedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  primaryClauseId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
  citedClauseIds: z.array(z.string().length(26)).optional(),
  citedEmailIds: z.array(z.string().length(26)).optional(),
  citedDocumentIds: z.array(z.string().length(26)).optional(),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/interpretations')
@UseGuards(AuthGuard, ContractAccessGuard)
export class InterpretationsController {
  constructor(@Inject(InterpretationsService) private readonly svc: InterpretationsService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: InterpretationRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.list(contractId) };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<InterpretationRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Get(':interpretationId/citations')
  async citations(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('interpretationId') id: string,
  ) {
    requireRole(access, REGISTER_READ_ROLES);
    return this.svc.listCitations(id);
  }
}
