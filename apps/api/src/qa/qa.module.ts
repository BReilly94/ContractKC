import { Module } from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import { ContractQaController, QaFeedbackController } from './qa.controller.js';
import { QaService } from './qa.service.js';

@Module({
  controllers: [ContractQaController, QaFeedbackController],
  providers: [QaService, ContractAccessService],
  exports: [QaService],
})
export class QaModule {}
