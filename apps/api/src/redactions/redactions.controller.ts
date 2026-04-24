import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
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
import { RedactionsService, type RedactionRow } from './redactions.service.js';

const ApplyBody = z.object({
  targetType: z.enum(['Document', 'DocumentVersion', 'Email', 'EmailAttachment', 'Clause']),
  targetId: z.string().length(26),
  targetPage: z.number().int().nullable(),
  spanStart: z.number().int().nullable(),
  spanEnd: z.number().int().nullable(),
  scope: z.enum(['Passage', 'Page', 'Document']),
  reasonCategory: z.enum([
    'Privileged',
    'CommerciallySensitive',
    'PersonalInformation',
    'ThirdPartyConfidential',
    'LegalHold',
    'Other',
  ]),
  reasonNote: z.string().max(1024).nullable(),
});

const ReverseBody = z.object({
  reversalReason: z.string().min(1).max(1024),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined => {
    const req = ctx.switchToHttp().getRequest<ContractAccessRequest>();
    return req.access;
  },
);

@Controller('api/contracts/:id/redactions')
@UseGuards(AuthGuard, ContractAccessGuard)
export class RedactionsController {
  constructor(@Inject(RedactionsService) private readonly redactions: RedactionsService) {}

  @Post()
  async apply(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<RedactionRow> {
    requireRole(access, ['Owner', 'Administrator']);
    const body = ApplyBody.parse(rawBody);
    return this.redactions.apply(principal, contractId, body, requireCorrelationId());
  }

  @Delete(':redactionId')
  async reverse(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Param('redactionId') redactionId: string,
    @Body() rawBody: unknown,
  ): Promise<{ ok: true }> {
    requireRole(access, ['Owner', 'Administrator']);
    const body = ReverseBody.parse(rawBody);
    await this.redactions.reverse(
      principal,
      contractId,
      redactionId,
      body.reversalReason,
      requireCorrelationId(),
    );
    return { ok: true };
  }

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<{ items: RedactionRow[] }> {
    requireRole(access, ['Owner', 'Administrator', 'Contributor', 'Viewer']);
    const items = await this.redactions.listForContract(contractId, {
      activeOnly: activeOnly === 'true',
    });
    return { items };
  }
}
