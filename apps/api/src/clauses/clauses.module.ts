import { Module } from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import { ClausesController, ContractClausesController } from './clauses.controller.js';
import { ClausesService } from './clauses.service.js';

@Module({
  controllers: [ContractClausesController, ClausesController],
  providers: [ClausesService, ContractAccessService],
  exports: [ClausesService],
})
export class ClausesModule {}
