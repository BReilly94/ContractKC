import type { Principal } from '@ckb/auth';
import type { AuditAction, AuditEntityType } from '@ckb/domain';
import { ForbiddenError, requireCorrelationId } from '@ckb/shared';
import {
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../common/auth.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { AuditExportService, type AuditExportFilters } from './audit-export.service.js';

/**
 * Auditor-gated export endpoint (Slice JJ — §5.11 carry-forward).
 *
 * Global role `Auditor` only. `SystemAdministrator` is permitted too so
 * platform admins can verify chain integrity, but the happy path is the
 * dedicated Auditor role.
 */
@Controller('api/admin/audit')
@UseGuards(AuthGuard)
export class AuditExportController {
  constructor(@Inject(AuditExportService) private readonly svc: AuditExportService) {}

  @Get('export')
  async exportCsv(
    @GetPrincipal() principal: Principal,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('entityType') entityType: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('action') action: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (
      principal.user.globalRole !== 'Auditor' &&
      principal.user.globalRole !== 'SystemAdministrator'
    ) {
      throw new ForbiddenError(
        'Audit export requires the Auditor global role (§5.11)',
      );
    }
    const filters: AuditExportFilters = {
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
      ...(entityType ? { entityType: entityType as AuditEntityType } : {}),
      ...(userId ? { userId } : {}),
      ...(action ? { action: action as AuditAction } : {}),
    };
    const { stream, filename } = await this.svc.streamCsv(
      principal,
      filters,
      requireCorrelationId(),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }
}
