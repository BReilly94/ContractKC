import type { Principal } from '@ckb/auth';
import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ContractAccessService } from '../common/access.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { EmailsService, type EmailDetailRow, type EmailListRow } from './emails.service.js';

@Controller('api/contracts/:id/emails')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractEmailsController {
  constructor(@Inject(EmailsService) private readonly service: EmailsService) {}

  @Get()
  async list(
    @Param('id') contractId: string,
    @Query('includeDuplicates') includeDuplicates?: string,
    @Query('senderTrustState') senderTrustState?: string,
  ): Promise<EmailListRow[]> {
    const options: {
      includeDuplicates?: boolean;
      senderTrustState?: 'Approved' | 'ReviewQueue' | 'Unapproved';
    } = {};
    if (includeDuplicates === 'true') options.includeDuplicates = true;
    if (senderTrustState === 'Approved' || senderTrustState === 'ReviewQueue' || senderTrustState === 'Unapproved') {
      options.senderTrustState = senderTrustState;
    }
    return this.service.listForContract(contractId, options);
  }
}

@Controller('api/emails')
@UseGuards(AuthGuard)
export class EmailsController {
  constructor(
    @Inject(EmailsService) private readonly service: EmailsService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Get(':id')
  async get(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<EmailDetailRow> {
    const email = await this.service.get(id);
    if (!email) throw new NotFoundException('Email not found');
    await this.access.assertAccess(principal, email.contractId);
    return email;
  }

  @Get(':id/raw-eml')
  @Header('Cache-Control', 'private, no-store')
  async rawEml(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const contractId = await this.service.getContractIdForEmail(id);
    if (!contractId) throw new NotFoundException('Email not found');
    await this.access.assertAccess(principal, contractId);
    const payload = await this.service.downloadRawEml(id);
    if (!payload) throw new NotFoundException('Email not found');
    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    return payload.bytes;
  }
}

@Controller('api/email-threads')
@UseGuards(AuthGuard)
export class EmailThreadsController {
  constructor(
    @Inject(EmailsService) private readonly service: EmailsService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Get(':id')
  async list(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<EmailListRow[]> {
    const contractId = await this.service.getContractIdForThread(id);
    if (!contractId) throw new NotFoundException('Thread not found');
    await this.access.assertAccess(principal, contractId);
    return this.service.listThread(id);
  }
}
