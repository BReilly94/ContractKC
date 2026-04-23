import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ContractAccessService } from '../common/access.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { QaService, type QaResponse } from './qa.service.js';

const QaBody = z.object({
  question: z.string().min(1).max(2048),
  topK: z.number().int().min(1).max(20).optional(),
});

const FeedbackBody = z.object({
  thumb: z.enum(['up', 'down']),
  comment: z.string().max(2000).optional(),
});

@Controller('api/contracts/:id/qa')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractQaController {
  constructor(@Inject(QaService) private readonly service: QaService) {}

  @Post()
  async ask(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<QaResponse> {
    const body = QaBody.parse(rawBody);
    return this.service.ask(
      principal,
      contractId,
      { question: body.question, ...(body.topK !== undefined ? { topK: body.topK } : {}) },
      requireCorrelationId(),
    );
  }
}

@Controller('api/qa')
@UseGuards(AuthGuard)
export class QaFeedbackController {
  constructor(
    @Inject(QaService) private readonly service: QaService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Post(':queryId/feedback')
  async feedback(
    @GetPrincipal() principal: Principal,
    @Param('queryId') queryId: string,
    @Body() rawBody: unknown,
  ): Promise<{ ok: true }> {
    const body = FeedbackBody.parse(rawBody);
    const contractId = await this.service.getContractIdForQuery(queryId);
    if (!contractId) throw new NotFoundException('Query not found');
    await this.access.assertAccess(principal, contractId);
    await this.service.feedback(principal, queryId, body.thumb, body.comment ?? null);
    return { ok: true };
  }
}
