import type { Principal } from '@ckb/auth';
import type { ContractRole } from '@ckb/domain';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
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
import { REGISTER_READ_ROLES } from '../common/register-helpers.js';
import { ErpService, type ErpSnapshotRow } from './erp.service.js';

// Owner + Commercial Lead (mapped as Administrator in the contract_role
// whitelist) per SOW §6.14 item 2. Contributors/Viewers can read (REGISTER_READ_ROLES)
// but not trigger refreshes or manual writes.
const ERP_WRITE_ROLES: readonly ContractRole[] = ['Owner', 'Administrator'];

const ApprovedVariation = z.object({
  reference: z.string().min(1).max(128),
  title: z.string().min(1).max(512),
  approvedAmountCents: z.number().int(),
  approvedAt: z.string().datetime().nullable().optional().transform((v) => v ?? null),
});

const ManualBody = z.object({
  approvedContractValueCents: z.number().int().nullable().optional().transform((v) => v ?? null),
  approvedVariations: z.array(ApprovedVariation).default([]),
  currency: z.string().length(3).nullable().optional().transform((v) => v ?? null),
  notes: z.string().max(8_000).nullable().optional().transform((v) => v ?? null),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/erp-snapshot')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ErpController {
  constructor(@Inject(ErpService) private readonly svc: ErpService) {}

  @Get()
  async getLatest(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<ErpSnapshotRow | { snapshot: null }> {
    requireRole(access, REGISTER_READ_ROLES);
    const snap = await this.svc.getLatestSnapshot(contractId);
    return snap ?? { snapshot: null };
  }

  @Post('refresh')
  async refresh(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<ErpSnapshotRow> {
    requireRole(access, ERP_WRITE_ROLES);
    const snap = await this.svc.refresh(
      contractId,
      { kind: 'user', userId: principal.userId },
      requireCorrelationId(),
    );
    if (!snap) {
      // ERP client is in manual mode and no manual snapshot exists yet.
      throw new NotFoundException(
        'No ERP snapshot available. Post manual entry via /erp-snapshot/manual.',
      );
    }
    return snap;
  }

  @Post('manual')
  async manualEntry(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<ErpSnapshotRow> {
    requireRole(access, ERP_WRITE_ROLES);
    const body = ManualBody.parse(rawBody);
    return this.svc.recordManualEntry(
      contractId,
      principal,
      body,
      requireCorrelationId(),
    );
  }
}
