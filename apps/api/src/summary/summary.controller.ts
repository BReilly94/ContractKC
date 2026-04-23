import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Controller,
  ExecutionContext,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { SummaryService, type SummaryRow } from './summary.service.js';

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined => {
    return ctx.switchToHttp().getRequest<ContractAccessRequest>().access;
  },
);

@Controller('api/contracts/:id/summary')
@UseGuards(AuthGuard, ContractAccessGuard)
export class SummaryController {
  constructor(@Inject(SummaryService) private readonly service: SummaryService) {}

  @Get()
  async get(@Param('id') contractId: string): Promise<SummaryRow> {
    const s = await this.service.getForContract(contractId);
    if (!s) throw new NotFoundException('Summary not found');
    return s;
  }

  @Post('generate')
  async generate(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
  ): Promise<{ queued: true }> {
    return this.service.enqueueGeneration(principal, contractId, requireCorrelationId());
  }

  @Post('verify')
  async verify(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @GetAccess() access: ContractAccessDecision | undefined,
  ): Promise<SummaryRow> {
    return this.service.verify(
      principal,
      contractId,
      access?.role ?? 'Viewer',
      requireCorrelationId(),
    );
  }
}
