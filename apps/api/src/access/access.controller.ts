import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  requireRole,
  type ContractAccessDecision,
} from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ContractAccessRequest } from '../common/contract-access.guard.js';
import { AccessService } from './access.service.js';

const GrantBody = z.object({
  userId: z.string().length(26),
  role: z.enum(['Owner', 'Administrator', 'Contributor', 'Viewer', 'RestrictedViewer']),
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
}
