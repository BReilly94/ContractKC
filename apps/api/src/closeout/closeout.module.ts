import { Module } from '@nestjs/common';
import { CloseoutController, CloseoutTemplatesController } from './closeout.controller.js';
import { CloseoutService } from './closeout.service.js';

@Module({
  controllers: [CloseoutController, CloseoutTemplatesController],
  providers: [CloseoutService],
  exports: [CloseoutService],
})
export class CloseoutModule {}
