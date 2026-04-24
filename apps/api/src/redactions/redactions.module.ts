import { Module } from '@nestjs/common';
import { RedactionsController } from './redactions.controller.js';
import { RedactionsService } from './redactions.service.js';

@Module({
  controllers: [RedactionsController],
  providers: [RedactionsService],
  exports: [RedactionsService],
})
export class RedactionsModule {}
