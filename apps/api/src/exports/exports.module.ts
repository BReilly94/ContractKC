import { Module } from '@nestjs/common';
import { ContractExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';

@Module({
  controllers: [ContractExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
