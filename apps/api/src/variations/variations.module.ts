import { Module } from '@nestjs/common';
import { VariationsController } from './variations.controller.js';
import { VariationsService } from './variations.service.js';

@Module({
  controllers: [VariationsController],
  providers: [VariationsService],
  exports: [VariationsService],
})
export class VariationsModule {}
