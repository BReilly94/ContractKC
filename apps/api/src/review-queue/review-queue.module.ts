import { Module } from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import {
  ContractReviewQueueController,
  ReviewQueueController,
} from './review-queue.controller.js';
import { ReviewQueueService } from './review-queue.service.js';

@Module({
  controllers: [ContractReviewQueueController, ReviewQueueController],
  providers: [ReviewQueueService, ContractAccessService],
  exports: [ReviewQueueService],
})
export class ReviewQueueModule {}
