import type { AuthProvider, Principal } from '@ckb/auth';
import type { RuntimeConfig } from '@ckb/runtime';
import { requireCorrelationId } from '@ckb/shared';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import { APP_CONFIG, AUTH_PROVIDER } from '../common/tokens.js';
import {
  BidHandoffService,
  type BidHandoffReceivedVia,
  type BidHandoffRow,
  type ReceiveBidHandoffResult,
} from './bid-handoff.service.js';

const AUTHORITY = z.enum([
  'CanDirectExtraWork',
  'CanIssueSiteInstructions',
  'CanApproveVariations',
  'Administrative',
]);

const LIKELIHOOD = z.enum(['Low', 'Medium', 'High']);

const CATEGORY = z.enum([
  'Commercial', 'Schedule', 'Technical', 'Safety', 'Regulatory',
  'Environmental', 'ClientBehaviour', 'Subcontractor', 'ForceMAjeure', 'Other',
]);

const WinningProposal = z.object({
  bidTitle: z.string().min(1).max(512),
  bidValueCents: z.number().int().nonnegative().nullable().optional().transform((v) => v ?? null),
  currency: z.string().length(3).nullable().optional().transform((v) => v ?? null),
  submittedAt: z.string().datetime().nullable().optional().transform((v) => v ?? null),
  winNoticeReceivedAt: z.string().datetime().nullable().optional().transform((v) => v ?? null),
  scopeSummary: z.string().max(8_000).nullable().optional().transform((v) => v ?? null),
});

const Estimate = z.object({
  label: z.string().min(1).max(256),
  amountCents: z.number().int().nonnegative().nullable().optional().transform((v) => v ?? null),
  currency: z.string().length(3).nullable().optional().transform((v) => v ?? null),
  basis: z.string().max(2_000).nullable().optional().transform((v) => v ?? null),
});

const Qualification = z.object({
  title: z.string().min(1).max(256),
  detail: z.string().max(8_000),
});

const Assumption = z.object({
  title: z.string().min(1).max(256),
  detail: z.string().max(8_000),
});

const RiskItem = z.object({
  title: z.string().min(1).max(512),
  description: z.string().max(8_000).nullable().optional().transform((v) => v ?? null),
  category: CATEGORY,
  probability: LIKELIHOOD,
  impact: LIKELIHOOD,
  mitigation: z.string().max(8_000).nullable().optional().transform((v) => v ?? null),
});

const Correspondence = z.object({
  kind: z.enum(['Email', 'Document']),
  subjectOrTitle: z.string().min(1).max(512),
  sentAt: z.string().datetime().nullable().optional().transform((v) => v ?? null),
  mimeType: z.string().min(1).max(128),
  originalFilename: z.string().min(1).max(512),
  contentBase64: z.string().min(1),
  fromAddress: z.string().max(320).nullable().optional().transform((v) => v ?? null),
  toAddresses: z.array(z.string().max(320)).nullable().optional().transform((v) => v ?? null),
});

const Contact = z.object({
  name: z.string().min(1).max(256),
  roleTitle: z.string().max(256).nullable().optional().transform((v) => v ?? null),
  email: z.string().email().max(320).nullable().optional().transform((v) => v ?? null),
  phone: z.string().max(64).nullable().optional().transform((v) => v ?? null),
  authorityLevel: AUTHORITY,
  notes: z.string().max(2_000).nullable().optional().transform((v) => v ?? null),
});

const PayloadSchema = z.object({
  bidId: z.string().min(1).max(128),
  sourceSystem: z.string().min(1).max(40),
  winningProposal: WinningProposal,
  estimates: z.array(Estimate).default([]),
  assumptions: z.array(Assumption).default([]),
  qualifications: z.array(Qualification).default([]),
  bidPhaseRisks: z.array(RiskItem).default([]),
  keyCorrespondence: z.array(Correspondence).default([]),
  contacts: z.array(Contact).default([]),
});

const ReceiveBody = z.object({
  contractId: z.string().length(26),
  dryRun: z.boolean().default(false),
  payload: PayloadSchema,
});

export interface BidHandoffAuthenticatedRequest extends Request {
  principal?: Principal;
  bidApiKey?: boolean;
}

@Controller('api/bid-handoffs')
export class BidHandoffController {
  constructor(
    @Inject(BidHandoffService) private readonly svc: BidHandoffService,
    @Inject(APP_CONFIG) private readonly config: RuntimeConfig,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  @Post()
  async receive(
    @Req() req: BidHandoffAuthenticatedRequest,
    @Body() rawBody: unknown,
  ): Promise<ReceiveBidHandoffResult> {
    const body = ReceiveBody.parse(rawBody);
    const { principal, via } = await this.authenticate(req);
    return this.svc.receive(
      principal,
      body.contractId,
      {
        payload: body.payload,
        receivedVia: via,
        dryRun: body.dryRun,
      },
      requireCorrelationId(),
    );
  }

  @Get()
  @UseGuards(AuthGuard)
  async list(
    @Query('contractId') contractId: string,
  ): Promise<{ items: BidHandoffRow[] }> {
    if (!contractId || contractId.length !== 26) {
      throw new BadRequestException('contractId query parameter required');
    }
    return { items: await this.svc.listForContract(contractId) };
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async get(@Param('id') id: string): Promise<BidHandoffRow> {
    const row = await this.svc.get(id);
    if (!row) throw new BadRequestException('Bid handoff not found');
    return row;
  }

  /**
   * Authenticate either as a KnowledgeCentreAdministrator/SystemAdministrator
   * user session (bearer token) OR as the Bid Integration system (api key
   * header). System-to-system is the normal case; the session path exists
   * for on-demand re-sync via the admin UI.
   */
  private async authenticate(
    req: BidHandoffAuthenticatedRequest,
  ): Promise<{ principal: Principal | null; via: BidHandoffReceivedVia }> {
    const apiKeyHeader = req.header('x-bid-integration-token');
    if (apiKeyHeader) {
      const expected = this.config.bidIntegrationToken;
      if (!expected) {
        throw new ForbiddenException('Bid integration token is not configured on the server');
      }
      if (apiKeyHeader !== expected) {
        throw new UnauthorizedException('Invalid bid integration token');
      }
      return { principal: null, via: 'ApiKey' };
    }

    const auth = req.header('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token or x-bid-integration-token');
    }
    const token = auth.slice('Bearer '.length);
    const principal = await this.authProvider.verifyToken(token);
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const role = principal.user.globalRole;
    if (role !== 'KnowledgeCentreAdministrator' && role !== 'SystemAdministrator') {
      throw new ForbiddenException('Only KC admins may receive bid handoffs via user session');
    }
    return { principal, via: 'UserSession' };
  }
}

