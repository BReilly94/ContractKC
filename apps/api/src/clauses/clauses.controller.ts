import type { Principal } from '@ckb/auth';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import {
  ClausesService,
  type ClauseRelationshipRow,
  type ClauseRow,
} from './clauses.service.js';

@Controller('api/contracts/:id/clauses')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractClausesController {
  constructor(@Inject(ClausesService) private readonly service: ClausesService) {}

  @Get()
  async list(
    @Param('id') contractId: string,
    @Query('type') type?: string,
  ): Promise<ClauseRow[]> {
    return this.service.listByContract(contractId, type);
  }
}

@Controller('api/clauses')
@UseGuards(AuthGuard)
export class ClausesController {
  constructor(
    @Inject(ClausesService) private readonly service: ClausesService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Get(':id')
  async get(@GetPrincipal() principal: Principal, @Param('id') id: string): Promise<ClauseRow> {
    const c = await this.service.get(id);
    if (!c) throw new NotFoundException('Clause not found');
    await this.access.assertAccess(principal, c.contractId);
    return c;
  }

  @Get(':id/relationships')
  async relationships(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<ClauseRelationshipRow[]> {
    const c = await this.service.get(id);
    if (!c) throw new NotFoundException('Clause not found');
    await this.access.assertAccess(principal, c.contractId);
    return this.service.relationshipsFor(id);
  }
}
