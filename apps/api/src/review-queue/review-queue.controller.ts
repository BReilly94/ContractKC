import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ContractAccessService } from '../common/access.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { ReviewQueueService, type ReviewQueueItem } from './review-queue.service.js';

const ReviewBody = z.object({
  notes: z.string().max(2000).optional(),
});

@Controller('api/contracts/:id/review-queue')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractReviewQueueController {
  constructor(@Inject(ReviewQueueService) private readonly service: ReviewQueueService) {}

  @Get()
  async list(
    @Param('id') contractId: string,
    @Query('state') state?: string,
    @Query('reason') reason?: string,
  ): Promise<ReviewQueueItem[]> {
    const options: {
      state?: 'Pending' | 'Approved' | 'Rejected' | 'Actioned';
      reason?: string;
    } = {};
    if (state === 'Pending' || state === 'Approved' || state === 'Rejected' || state === 'Actioned') {
      options.state = state;
    }
    if (reason) options.reason = reason;
    return this.service.listForContract(contractId, options);
  }
}

@Controller('api/review-queue')
@UseGuards(AuthGuard)
export class ReviewQueueController {
  constructor(
    @Inject(ReviewQueueService) private readonly service: ReviewQueueService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Post(':id/approve')
  async approve(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<ReviewQueueItem> {
    const item = await this.service.get(id);
    if (!item) throw new NotFoundException('Review queue item not found');
    await this.access.assertAccess(principal, item.contractId);
    const body = ReviewBody.parse(rawBody ?? {});
    return this.service.approve(principal, id, body.notes ?? null, requireCorrelationId());
  }

  @Post(':id/reject')
  async reject(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<ReviewQueueItem> {
    const item = await this.service.get(id);
    if (!item) throw new NotFoundException('Review queue item not found');
    await this.access.assertAccess(principal, item.contractId);
    const body = ReviewBody.parse(rawBody ?? {});
    return this.service.reject(principal, id, body.notes ?? null, requireCorrelationId());
  }

  @Post(':id/action')
  async action(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<ReviewQueueItem> {
    const item = await this.service.get(id);
    if (!item) throw new NotFoundException('Review queue item not found');
    await this.access.assertAccess(principal, item.contractId);
    const body = ReviewBody.parse(rawBody ?? {});
    return this.service.markActioned(principal, id, body.notes ?? null, requireCorrelationId());
  }
}
