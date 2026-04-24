import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  requireRole,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { REGISTER_READ_ROLES } from '../common/register-helpers.js';
import {
  TIMELINE_ALL_KINDS,
  TimelineService,
  type TimelineKind,
  type TimelineListResult,
} from './timeline.service.js';

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/timeline')
@UseGuards(AuthGuard, ContractAccessGuard)
export class TimelineController {
  constructor(@Inject(TimelineService) private readonly svc: TimelineService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kinds') kinds?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TimelineListResult> {
    requireRole(access, REGISTER_READ_ROLES);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      throw new BadRequestException('limit must be a positive integer');
    }
    const fromDate = from ? parseDate('from', from) : undefined;
    const toDate = to ? parseDate('to', to) : undefined;
    const parsedKinds: TimelineKind[] | undefined = kinds
      ? kinds.split(',').map((k) => k.trim()).filter((k) => (TIMELINE_ALL_KINDS as readonly string[]).includes(k)) as TimelineKind[]
      : undefined;

    return this.svc.listForContract(contractId, {
      ...(fromDate !== undefined ? { from: fromDate } : {}),
      ...(toDate !== undefined ? { to: toDate } : {}),
      ...(parsedKinds !== undefined ? { kinds: parsedKinds } : {}),
      limit: parsedLimit,
      cursor: cursor ?? null,
    });
  }
}

function parseDate(name: string, value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${name} is not a valid ISO 8601 timestamp`);
  }
  return d;
}
