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
import { AccessService, type RevocationRow } from './access.service.js';

const GrantBody = z.object({
  userId: z.string().length(26),
  role: z.enum(['Owner', 'Administrator', 'Contributor', 'Viewer', 'RestrictedViewer']),
});

const RevokeBody = z.object({
  userId: z.string().length(26),
  reasonCategory: z.enum([
    'ConflictOfInterest',
    'RoleChange',
    'LegalInstruction',
    'EthicalWall',
    'Other',
  ]),
  reasonNote: z.string().max(2000).nullable(),
  notifySubject: z.boolean(),
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

@Controller('api/contracts/:id/access')
@UseGuards(AuthGuard, ContractAccessGuard)
export class AccessController {
  constructor(@Inject(AccessService) private readonly access: AccessService) {}

  @Post()
  async grant(
    @GetPrincipal() principal: Principal,
    @GetAccess() accessDecision: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<{ id: string }> {
    requireRole(accessDecision, ['Owner']);
    const body = GrantBody.parse(rawBody);
    return this.access.grant(
      principal,
      contractId,
      body.userId,
      body.role,
      requireCorrelationId(),
    );
  }

  @Post('revocations')
  async revoke(
    @GetPrincipal() principal: Principal,
    @GetAccess() accessDecision: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<{ id: string }> {
    requireRole(accessDecision, ['Owner', 'Administrator']);
    const body = RevokeBody.parse(rawBody);
    return this.access.revoke(
      principal,
      contractId,
      body.userId,
      {
        reasonCategory: body.reasonCategory,
        reasonNote: body.reasonNote,
        notifySubject: body.notifySubject,
      },
      requireCorrelationId(),
    );
  }

  @Delete('revocations/:revocationId')
  async reverseRevocation(
    @GetPrincipal() principal: Principal,
    @GetAccess() accessDecision: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Param('revocationId') revocationId: string,
    @Body() rawBody: unknown,
  ): Promise<{ ok: true }> {
    requireRole(accessDecision, ['Owner', 'Administrator']);
    const body = ReverseBody.parse(rawBody);
    await this.access.reverseRevocation(
      principal,
      contractId,
      revocationId,
      body.reversalReason,
      requireCorrelationId(),
    );
    return { ok: true };
  }

  @Get('revocations')
  async listRevocations(
    @GetAccess() accessDecision: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: RevocationRow[] }> {
    requireRole(accessDecision, ['Owner', 'Administrator']);
    const items = await this.access.listRevocations(contractId);
    return { items };
  }
}
