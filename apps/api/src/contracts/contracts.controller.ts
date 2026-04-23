import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard, requireRole } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import type { ContractAccessDecision } from '../common/contract-access.guard.js';
import { ContractsService, type ContractRow } from './contracts.service.js';
import { CreateContractBody, LifecycleTransitionBody } from './dtos.js';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ContractAccessRequest } from '../common/contract-access.guard.js';

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined => {
    const req = ctx.switchToHttp().getRequest<ContractAccessRequest>();
    return req.access;
  },
);

@Controller('api/contracts')
@UseGuards(AuthGuard)
export class ContractsController {
  constructor(@Inject(ContractsService) private readonly contracts: ContractsService) {}

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @Body() rawBody: unknown,
  ): Promise<ContractRow> {
    const body = CreateContractBody.parse(rawBody);
    return this.contracts.create(principal, body, requireCorrelationId());
  }

  @Get()
  async list(@GetPrincipal() principal: Principal): Promise<ContractRow[]> {
    return this.contracts.listForUser(principal.userId);
  }

  @Get(':id')
  @UseGuards(ContractAccessGuard)
  async detail(@Param('id') id: string): Promise<ContractRow> {
    const row = await this.contracts.findById(id);
    if (!row) throw new NotFoundException('Contract not found');
    return row;
  }

  @Patch(':id/lifecycle')
  @UseGuards(ContractAccessGuard)
  async transition(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @GetAccess() access: ContractAccessDecision | undefined,
  ): Promise<ContractRow> {
    requireRole(access, ['Owner']);
    const body = LifecycleTransitionBody.parse(rawBody);
    return this.contracts.transitionLifecycle(
      principal,
      id,
      body.targetState,
      requireCorrelationId(),
    );
  }
}
