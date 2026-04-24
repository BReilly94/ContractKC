import { Module } from '@nestjs/common';
import { ErpController } from './erp.controller.js';
import { ErpService } from './erp.service.js';

@Module({
  controllers: [ErpController],
  providers: [ErpService],
  exports: [ErpService],
})
export class ErpModule {}
