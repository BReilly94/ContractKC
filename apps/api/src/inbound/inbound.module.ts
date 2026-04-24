import { Module } from '@nestjs/common';
import { InboundEmailController } from './inbound.controller.js';
import { InboundEmailService } from './inbound.service.js';

@Module({
  controllers: [InboundEmailController],
  providers: [InboundEmailService],
})
export class InboundEmailModule {}
