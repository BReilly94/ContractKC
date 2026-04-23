import type { Principal } from '@ckb/auth';
import { ForbiddenError, requireCorrelationId } from '@ckb/shared';
import {
  Controller,
  ExecutionContext,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { ExportsService, type ExportJobSummary } from './exports.service.js';

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined => {
    return ctx.switchToHttp().getRequest<ContractAccessRequest>().access;
  },
);

@Controller('api/contracts/:id/exports')
@UseGuards(AuthGuard, ContractAccessGuard)
export class ContractExportsController {
  constructor(@Inject(ExportsService) private readonly service: ExportsService) {}

  @Get()
  async list(@Param('id') contractId: string): Promise<ExportJobSummary[]> {
    return this.service.listForContract(contractId);
  }

  @Post('generate')
  async generate(
    @GetPrincipal() principal: Principal,
    @Param('id') contractId: string,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Query('includeRedacted') includeRedacted: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const wantRedacted = includeRedacted === 'true';
    if (wantRedacted && access?.role !== 'Owner' && access?.role !== 'Administrator') {
      throw new ForbiddenError(
        'Only Owner or Administrator may request non-redacted exports (security.md §13)',
      );
    }
    const { stream, filename } = await this.service.stream(
      principal,
      contractId,
      { includeRedacted: wantRedacted },
      requireCorrelationId(),
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }
}
