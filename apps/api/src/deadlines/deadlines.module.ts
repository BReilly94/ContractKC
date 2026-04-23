import { Module } from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import {
  ContractDeadlinesController,
  DeadlinesController,
} from './deadlines.controller.js';
import { DeadlinesService } from './deadlines.service.js';

@Module({
  controllers: [ContractDeadlinesController, DeadlinesController],
  providers: [DeadlinesService, ContractAccessService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}
