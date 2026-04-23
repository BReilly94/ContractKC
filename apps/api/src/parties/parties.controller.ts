import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { PartiesService, type PartyRow } from './parties.service.js';

const CreatePartyBody = z.object({
  name: z.string().min(1).max(256),
});

@Controller('api/parties')
@UseGuards(AuthGuard)
export class PartiesController {
  constructor(@Inject(PartiesService) private readonly parties: PartiesService) {}

  @Get()
  async list(@Query('q') q?: string): Promise<PartyRow[]> {
    return this.parties.list(q);
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @Body() rawBody: unknown,
  ): Promise<PartyRow> {
    const body = CreatePartyBody.parse(rawBody);
    return this.parties.create(principal, body.name, requireCorrelationId());
  }
}
