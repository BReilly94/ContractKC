import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ContractAccessService } from '../common/access.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { ContactsService, type ContactRow } from './contacts.service.js';

const AUTHORITY_VALUES = [
  'CanDirectExtraWork',
  'CanIssueSiteInstructions',
  'CanApproveVariations',
  'Administrative',
] as const;

const CreateBody = z.object({
  partyId: z.string().length(26).nullable().optional(),
  name: z.string().min(1).max(256),
  roleTitle: z.string().max(256).nullable().optional(),
  email: z.string().email().max(320).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  authorityLevel: z.enum(AUTHORITY_VALUES).default('Administrative'),
  notes: z.string().max(2000).nullable().optional(),
});

const UpdateBody = CreateBody.partial();

@Controller('api/contracts/:id/contacts')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractContactsController {
  constructor(@Inject(ContactsService) private readonly service: ContactsService) {}

  @Get()
  async list(@Param('id') contractId: string): Promise<ContactRow[]> {
    return this.service.listForContract(contractId);
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<ContactRow> {
    const body = CreateBody.parse(rawBody);
    return this.service.create(
      principal,
      contractId,
      {
        partyId: body.partyId ?? null,
        name: body.name,
        roleTitle: body.roleTitle ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        authorityLevel: body.authorityLevel,
        notes: body.notes ?? null,
      },
      requireCorrelationId(),
    );
  }
}

@Controller('api/contacts')
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(
    @Inject(ContactsService) private readonly service: ContactsService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Get(':id')
  async get(@GetPrincipal() principal: Principal, @Param('id') id: string): Promise<ContactRow> {
    const c = await this.service.get(id);
    if (!c) throw new NotFoundException('Contact not found');
    await this.access.assertAccess(principal, c.contractId);
    return c;
  }

  @Patch(':id')
  async update(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<ContactRow> {
    const c = await this.service.get(id);
    if (!c) throw new NotFoundException('Contact not found');
    await this.access.assertAccess(principal, c.contractId);
    const body = UpdateBody.parse(rawBody);
    return this.service.update(principal, id, body, requireCorrelationId());
  }

  @Delete(':id')
  async delete(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const c = await this.service.get(id);
    if (!c) throw new NotFoundException('Contact not found');
    await this.access.assertAccess(principal, c.contractId);
    await this.service.delete(principal, id, requireCorrelationId());
    return { ok: true };
  }
}
