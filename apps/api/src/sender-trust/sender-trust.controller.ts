import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { SenderTrustService, type SenderTrustRow } from './sender-trust.service.js';

const AddBody = z.object({
  matchType: z.enum(['ExactAddress', 'Domain']),
  matchValue: z.string().min(1).max(320),
  trustState: z.enum(['Approved', 'Denied']),
  reason: z.string().max(1024).optional(),
});

@Controller('api/contracts/:id/sender-trust')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractSenderTrustController {
  constructor(@Inject(SenderTrustService) private readonly service: SenderTrustService) {}

  @Get()
  async list(@Param('id') contractId: string): Promise<SenderTrustRow[]> {
    return this.service.listForContract(contractId);
  }

  @Post()
  async add(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<SenderTrustRow> {
    const body = AddBody.parse(rawBody);
    return this.service.add(
      principal,
      {
        contractId,
        matchType: body.matchType,
        matchValue: body.matchValue,
        trustState: body.trustState,
        reason: body.reason ?? null,
      },
      requireCorrelationId(),
    );
  }

  @Delete(':entryId')
  async remove(
    @GetPrincipal() principal: Principal,
    @Param('entryId') entryId: string,
  ): Promise<{ ok: true }> {
    await this.service.remove(principal, entryId, requireCorrelationId());
    return { ok: true };
  }
}

@Controller('api/admin/global-sender-trust')
@UseGuards(AuthGuard)
export class GlobalSenderTrustController {
  constructor(@Inject(SenderTrustService) private readonly service: SenderTrustService) {}

  private assertKcAdmin(principal: Principal): void {
    const role = principal.user.globalRole;
    if (role !== 'KnowledgeCentreAdministrator' && role !== 'SystemAdministrator') {
      throw new ForbiddenException('Only KC admins can manage global sender trust');
    }
  }

  @Get()
  async list(@GetPrincipal() principal: Principal): Promise<SenderTrustRow[]> {
    this.assertKcAdmin(principal);
    return this.service.listGlobal();
  }

  @Post()
  async add(
    @GetPrincipal() principal: Principal,
    @Body() rawBody: unknown,
  ): Promise<SenderTrustRow> {
    this.assertKcAdmin(principal);
    const body = AddBody.parse(rawBody);
    return this.service.add(
      principal,
      {
        contractId: null,
        matchType: body.matchType,
        matchValue: body.matchValue,
        trustState: body.trustState,
        reason: body.reason ?? null,
      },
      requireCorrelationId(),
    );
  }

  @Delete(':entryId')
  async remove(
    @GetPrincipal() principal: Principal,
    @Param('entryId') entryId: string,
  ): Promise<{ ok: true }> {
    this.assertKcAdmin(principal);
    await this.service.remove(principal, entryId, requireCorrelationId());
    return { ok: true };
  }
}
