import type { Principal } from '@ckb/auth';
import { ForbiddenError, requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { DigestService, type DigestPreferenceRow } from './digest.service.js';

const UpsertBody = z.object({
  contractId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
  frequency: z.enum(['Daily', 'Weekly', 'Off']),
  channels: z.array(z.enum(['InApp', 'Email'])).min(1),
  categories: z
    .array(
      z.enum([
        'upcoming_deadlines',
        'pending_reviews',
        'new_flags',
        'claim_status_changes',
        'contract_events',
      ]),
    )
    .min(1),
});

@Controller('api/users/:id/digest-preferences')
@UseGuards(AuthGuard)
export class DigestController {
  constructor(@Inject(DigestService) private readonly svc: DigestService) {}

  @Get()
  async list(
    @GetPrincipal() principal: Principal,
    @Param('id') userId: string,
  ): Promise<{ items: DigestPreferenceRow[] }> {
    // User self-read, or admin read for support.
    const allowed =
      principal.userId === userId ||
      principal.user.globalRole === 'SystemAdministrator' ||
      principal.user.globalRole === 'KnowledgeCentreAdministrator' ||
      principal.user.globalRole === 'Auditor';
    if (!allowed) throw new ForbiddenError('Not authorized to view these preferences');
    return { items: await this.svc.listForUser(userId) };
  }

  @Post()
  async upsert(
    @GetPrincipal() principal: Principal,
    @Param('id') userId: string,
    @Body() rawBody: unknown,
  ): Promise<DigestPreferenceRow> {
    const body = UpsertBody.parse(rawBody);
    return this.svc.upsert(
      principal,
      userId,
      body,
      requireCorrelationId(),
    );
  }
}
