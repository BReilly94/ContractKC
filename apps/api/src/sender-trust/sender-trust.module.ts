import { Module } from '@nestjs/common';
import {
  ContractSenderTrustController,
  GlobalSenderTrustController,
} from './sender-trust.controller.js';
import { SenderTrustService } from './sender-trust.service.js';

@Module({
  controllers: [ContractSenderTrustController, GlobalSenderTrustController],
  providers: [SenderTrustService],
  exports: [SenderTrustService],
})
export class SenderTrustModule {}
