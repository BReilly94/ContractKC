import type { Principal } from '@ckb/auth';
import { requireCorrelationId } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  requireRole,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { REGISTER_READ_ROLES, REGISTER_WRITE_ROLES } from '../common/register-helpers.js';
import {
  CloseoutService,
  type CloseoutChecklistRow,
  type CloseoutItemRow,
  type CloseoutTemplateRow,
} from './closeout.service.js';

const CreateFromTemplateBody = z.object({
  templateId: z.string().length(26),
});

const WaiveBody = z.object({
  reason: z.string().min(4).max(1024),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

/**
 * Templates live above the contract-access layer — they are a directory of
 * shared defaults, not a contract artifact. Auth is still required.
 */
@Controller('api/closeout/templates')
@UseGuards(AuthGuard)
export class CloseoutTemplatesController {
  constructor(@Inject(CloseoutService) private readonly svc: CloseoutService) {}

  @Get()
  async list(): Promise<{ items: CloseoutTemplateRow[] }> {
    return { items: await this.svc.listTemplates() };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CloseoutTemplateRow> {
    const t = await this.svc.getTemplate(id);
    if (!t) {
      throw Object.assign(new Error('Template not found'), { status: 404 });
    }
    return t;
  }
}

@Controller('api/contracts/:id/closeout')
@UseGuards(AuthGuard, ContractAccessGuard)
export class CloseoutController {
  constructor(@Inject(CloseoutService) private readonly svc: CloseoutService) {}

  @Get()
  async get(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ checklist: CloseoutChecklistRow | null; items: CloseoutItemRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return this.svc.getForContract(contractId);
  }

  @Post()
  async createFromTemplate(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<CloseoutChecklistRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateFromTemplateBody.parse(rawBody);
    return this.svc.createFromTemplate(
      principal,
      contractId,
      body.templateId,
      requireCorrelationId(),
    );
  }

  @Post('items/:itemId/sign')
  async signItem(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('itemId') itemId: string,
  ): Promise<CloseoutItemRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    return this.svc.signItem(principal, itemId, requireCorrelationId());
  }

  @Post('items/:itemId/waive')
  async waiveItem(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('itemId') itemId: string,
    @Body() rawBody: unknown,
  ): Promise<CloseoutItemRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = WaiveBody.parse(rawBody);
    return this.svc.waiveItem(
      principal,
      itemId,
      body.reason,
      access?.role ?? '',
      requireCorrelationId(),
    );
  }

  @Post('certificate')
  async generateCertificate(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<CloseoutChecklistRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    return this.svc.generateCertificate(principal, contractId, requireCorrelationId());
  }

  @Get('archive-gate')
  async evaluateArchiveGate(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ allowed: boolean; failure: unknown }> {
    requireRole(access, REGISTER_READ_ROLES);
    const failure = await this.svc.evaluateArchiveGate(contractId);
    return { allowed: failure === null, failure };
  }
}
