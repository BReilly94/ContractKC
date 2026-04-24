import { Module } from '@nestjs/common';
import { BidHandoffController } from './bid-handoff.controller.js';
import { BidHandoffService } from './bid-handoff.service.js';

@Module({
  controllers: [BidHandoffController],
  providers: [BidHandoffService],
  exports: [BidHandoffService],
})
export class BidHandoffModule {}
