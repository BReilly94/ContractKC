import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ContractAccessService } from '../common/access.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { DocumentsService, type DocumentRow } from './documents.service.js';
import {
  AddTagBody,
  CreateVersionBody,
  ListDocumentsQuery,
  UploadDocumentBody,
} from './dtos.js';

/**
 * Two controllers — contract-scoped (behind ContractAccessGuard) and
 * document-scoped (access re-checked via the parent contract inside the
 * controller using ContractAccessService).
 */

@Controller('api/contracts/:id/documents')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractDocumentsController {
  constructor(@Inject(DocumentsService) private readonly service: DocumentsService) {}

  @Get()
  async list(
    @Param('id') contractId: string,
    @Query() query: unknown,
  ): Promise<DocumentRow[]> {
    const parsed = ListDocumentsQuery.parse(query);
    return this.service.listForContract(contractId, parsed);
  }

  @Post()
  async upload(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<DocumentRow> {
    const body = UploadDocumentBody.parse(rawBody);
    return this.service.upload(principal, contractId, body, requireCorrelationId());
  }
}

@Controller('api/documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly service: DocumentsService,
    @Inject(ContractAccessService) private readonly access: ContractAccessService,
  ) {}

  @Get(':id')
  async get(@GetPrincipal() principal: Principal, @Param('id') id: string): Promise<DocumentRow> {
    const doc = await this.service.get(id);
    if (!doc) throw new NotFoundException('Document not found');
    await this.access.assertAccess(principal, doc.contractId);
    return doc;
  }

  @Get(':id/content')
  @Header('Cache-Control', 'private, no-store')
  async download(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const doc = await this.service.get(id);
    if (!doc) throw new NotFoundException('Document not found');
    await this.access.assertAccess(principal, doc.contractId);
    const payload = await this.service.readContent(id);
    if (!payload) throw new NotFoundException('Document not found');
    res.setHeader('Content-Type', payload.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(payload.filename)}`,
    );
    return payload.bytes;
  }

  @Post(':id/tags')
  async addTag(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<{ ok: true }> {
    const doc = await this.service.get(id);
    if (!doc) throw new NotFoundException('Document not found');
    await this.access.assertAccess(principal, doc.contractId);
    const body = AddTagBody.parse(rawBody);
    await this.service.addTag(principal, id, body, requireCorrelationId());
    return { ok: true };
  }

  @Delete(':id/tags/:tagId')
  async removeTag(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ): Promise<{ ok: true }> {
    if (!tagId || tagId.length !== 26) throw new BadRequestException('Invalid tag id');
    const doc = await this.service.get(id);
    if (!doc) throw new NotFoundException('Document not found');
    await this.access.assertAccess(principal, doc.contractId);
    await this.service.removeTag(principal, id, tagId, requireCorrelationId());
    return { ok: true };
  }

  @Post(':id/versions')
  async createVersion(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<DocumentRow> {
    const doc = await this.service.get(id);
    if (!doc) throw new NotFoundException('Document not found');
    await this.access.assertAccess(principal, doc.contractId);
    const body = CreateVersionBody.parse(rawBody);
    return this.service.createVersion(principal, id, body, requireCorrelationId());
  }
}
