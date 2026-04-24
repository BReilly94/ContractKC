import type { Principal } from '@ckb/auth';
import { createLogger } from '@ckb/shared';
import {
  Body,
  Controller,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { ForwardEmailBody } from './dtos.js';
import { InboundEmailService, type ForwardResult } from './inbound.service.js';

const log = createLogger('inbound-email', 'info');

/**
 * `POST /api/contracts/:id/emails/forward` — the Outlook add-in entry point
 * (SOW §6.18). Body: `{ emlBase64, envelopeFrom?, source? }`.
 *
 * The contract-access guard (per-contract default-deny) is the only authorisation
 * needed: the user must already have Contributor-or-higher on the contract they
 * are routing the email to. The guard honours revocations (security.md §3).
 */
@Controller('api/contracts/:id/emails')
@UseGuards(AuthGuard, ContractAccessGuard)
export class InboundEmailController {
  constructor(
    @Inject(InboundEmailService) private readonly service: InboundEmailService,
  ) {}

  @Post('forward')
  async forward(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<ForwardResult> {
    const body = ForwardEmailBody.parse(rawBody);
    return this.service.forwardFromAddin(principal, contractId, body, log);
  }
}
