import type { ContractRole } from '@ckb/domain';
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import mssql from 'mssql';
import type { AuthedRequest } from './auth.guard.js';
import { DB_POOL } from './tokens.js';

export interface ContractAccessDecision {
  readonly allow: true;
  readonly role: ContractRole;
}

export interface ContractAccessRequest extends AuthedRequest {
  access?: ContractAccessDecision;
}

@Injectable()
export class ContractAccessGuard implements CanActivate {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ContractAccessRequest>();
    const principal = req.principal;
    if (!principal) throw new UnauthorizedException('No principal attached');

    const contractId = req.params['id'];
    if (!contractId || contractId.length !== 26) {
      throw new BadRequestException('Invalid contract id');
    }

    const result = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .input('user_id', mssql.Char(26), principal.userId)
      .query<{ revocation_id: string | null; contract_role: ContractRole | null }>(`
        SELECT
          (SELECT TOP 1 id FROM contract_access_revocation
           WHERE contract_id = @contract_id AND user_id = @user_id AND reversed_at IS NULL) AS revocation_id,
          (SELECT TOP 1 contract_role FROM contract_access
           WHERE contract_id = @contract_id AND user_id = @user_id) AS contract_role
      `);
    const row = result.recordset[0];
    if (!row || row.revocation_id || !row.contract_role) {
      throw new NotFoundException('Contract not found');
    }

    req.access = { allow: true, role: row.contract_role };
    return true;
  }
}

export function requireRole(
  decision: ContractAccessDecision | undefined,
  allowed: readonly ContractRole[],
): void {
  if (!decision || !allowed.includes(decision.role)) {
    throw new NotFoundException('Contract not found');
  }
}
