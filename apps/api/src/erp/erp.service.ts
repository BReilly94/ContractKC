import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type {
  ErpApprovedVariation,
  ErpSourceSystem,
} from '@ckb/domain';
import type { ErpClient } from '@ckb/erp';
import { ErpFetchError } from '@ckb/erp';
import { asBrandedId, newUlid, NotFoundError, utcNow, ValidationError } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL, ERP_CLIENT } from '../common/tokens.js';
import { assertContractExists } from '../common/register-helpers.js';

/**
 * ERP read-only linkage service (Slice Z, §6.14).
 *
 * Reads return the latest snapshot for a contract (no history replay from
 * a point-in-time; Phase 2 scope is current-state only). Writes are either:
 *   - `refresh(contractId, principal)` — pull via `ErpClient` and persist.
 *   - `recordManualEntry(contractId, input, principal)` — manual fallback.
 *
 * The audit log records WHO wrote the row and by what mechanism. The
 * scheduler worker passes `null` principal and writes `scheduler` in
 * `last_refreshed_by_system`; the DB CHECK enforces the XOR invariant.
 */

export type ErpRefreshPrincipal =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'scheduler' };

export interface ErpSnapshotRow {
  readonly id: string;
  readonly contractId: string;
  readonly takenAt: Date;
  readonly approvedContractValueCents: number | null;
  readonly approvedVariations: readonly ErpApprovedVariation[];
  readonly sourceSystem: ErpSourceSystem;
  readonly currency: string | null;
  readonly lastRefreshedByUserId: string | null;
  readonly lastRefreshedBySystem: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
}

interface DbRow {
  id: string;
  contract_id: string;
  taken_at: Date;
  approved_contract_value_cents: number | string | null;
  approved_variations: string;
  source_system: ErpSourceSystem;
  currency: string | null;
  last_refreshed_by_user_id: string | null;
  last_refreshed_by_system: string | null;
  notes: string | null;
  created_at: Date;
}

function asNumber(v: number | string | null): number | null {
  if (v === null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function mapRow(r: DbRow): ErpSnapshotRow {
  let approvedVariations: ErpApprovedVariation[] = [];
  try {
    const parsed = JSON.parse(r.approved_variations) as unknown;
    if (Array.isArray(parsed)) {
      approvedVariations = parsed as ErpApprovedVariation[];
    }
  } catch {
    // ASSUMPTION: malformed JSON on a snapshot row indicates an upstream
    // client bug. Return an empty list so reads don't crash the dashboard;
    // the integrity of the stored blob is preserved for operator review.
    approvedVariations = [];
  }
  return {
    id: r.id,
    contractId: r.contract_id,
    takenAt: r.taken_at,
    approvedContractValueCents: asNumber(r.approved_contract_value_cents),
    approvedVariations,
    sourceSystem: r.source_system,
    currency: r.currency,
    lastRefreshedByUserId: r.last_refreshed_by_user_id,
    lastRefreshedBySystem: r.last_refreshed_by_system,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

const SELECT = `
  SELECT id, contract_id, taken_at, approved_contract_value_cents,
         approved_variations, source_system, currency,
         last_refreshed_by_user_id, last_refreshed_by_system, notes, created_at
    FROM erp_snapshot
`;

export interface ManualSnapshotInput {
  readonly approvedContractValueCents: number | null;
  readonly approvedVariations: readonly ErpApprovedVariation[];
  readonly currency: string | null;
  readonly notes: string | null;
}

@Injectable()
export class ErpService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(ERP_CLIENT) private readonly erp: ErpClient,
  ) {}

  async getLatestSnapshot(contractId: string): Promise<ErpSnapshotRow | null> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<DbRow>(
        `${SELECT} WHERE contract_id = @contract_id
         ORDER BY taken_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`,
      );
    return r.recordset[0] ? mapRow(r.recordset[0]) : null;
  }

  async refresh(
    contractId: string,
    principal: ErpRefreshPrincipal,
    correlationId: string,
  ): Promise<ErpSnapshotRow | null> {
    await assertContractExists(this.pool, contractId);
    // Manual-mode clients have no upstream — the scheduler path logs the
    // attempt and returns the latest manual snapshot unchanged.
    if (this.erp.sourceSystem === 'Manual') {
      return this.getLatestSnapshot(contractId);
    }
    let fetched;
    try {
      fetched = await this.erp.fetchContractSnapshot(contractId);
    } catch (err) {
      if (err instanceof ErpFetchError) {
        throw new ValidationError(`ERP fetch failed: ${err.message}`, { code: err.code });
      }
      throw err;
    }

    return this.persistSnapshot(
      contractId,
      {
        approvedContractValueCents: fetched.approvedContractValueCents,
        approvedVariations: fetched.approvedVariations,
        currency: fetched.currency,
        notes: fetched.notes,
      },
      fetched.sourceSystem,
      principal,
      'erp.refresh',
      correlationId,
    );
  }

  async recordManualEntry(
    contractId: string,
    principal: Principal,
    input: ManualSnapshotInput,
    correlationId: string,
  ): Promise<ErpSnapshotRow> {
    await assertContractExists(this.pool, contractId);
    const row = await this.persistSnapshot(
      contractId,
      input,
      'Manual',
      { kind: 'user', userId: principal.userId },
      'erp.manual_entry',
      correlationId,
    );
    if (!row) throw new Error('ErpSnapshot disappeared after manual entry');
    return row;
  }

  private async persistSnapshot(
    contractId: string,
    input: ManualSnapshotInput,
    sourceSystem: ErpSourceSystem,
    principal: ErpRefreshPrincipal,
    action: 'erp.refresh' | 'erp.manual_entry',
    correlationId: string,
  ): Promise<ErpSnapshotRow | null> {
    const id = newUlid();
    const userId = principal.kind === 'user' ? principal.userId : null;
    const systemLabel = principal.kind === 'scheduler' ? 'scheduler' : null;
    const now = utcNow();
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('taken_at', mssql.DateTimeOffset, now)
        .input('approved_contract_value_cents', mssql.BigInt, input.approvedContractValueCents)
        .input('approved_variations', mssql.NVarChar(mssql.MAX), JSON.stringify(input.approvedVariations))
        .input('source_system', mssql.VarChar(40), sourceSystem)
        .input('currency', mssql.Char(3), input.currency)
        .input('last_refreshed_by_user_id', mssql.Char(26), userId)
        .input('last_refreshed_by_system', mssql.VarChar(40), systemLabel)
        .input('notes', mssql.NVarChar(mssql.MAX), input.notes)
        .query(`
          INSERT INTO erp_snapshot
            (id, contract_id, taken_at, approved_contract_value_cents,
             approved_variations, source_system, currency,
             last_refreshed_by_user_id, last_refreshed_by_system, notes)
          VALUES
            (@id, @contract_id, @taken_at, @approved_contract_value_cents,
             @approved_variations, @source_system, @currency,
             @last_refreshed_by_user_id, @last_refreshed_by_system, @notes);
        `);
      const actorUserId = userId
        ? asBrandedId<'User'>(userId)
        : asBrandedId<'User'>(await this.resolveSystemUserId(tx));
      await logAudit(tx, {
        actorUserId,
        action,
        entityType: 'ErpSnapshot',
        entityId: id,
        after: {
          contractId,
          sourceSystem,
          approvedContractValueCents: input.approvedContractValueCents,
          variationCount: input.approvedVariations.length,
          via: principal.kind,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    return this.getLatestSnapshot(contractId);
  }

  private async resolveSystemUserId(tx: mssql.Transaction): Promise<string> {
    const r = await new mssql.Request(tx).query<{ id: string }>(
      `SELECT TOP 1 id FROM app_user
        WHERE global_role IN ('SystemAdministrator','KnowledgeCentreAdministrator')
        ORDER BY created_at ASC`,
    );
    const id = r.recordset[0]?.id;
    if (!id) throw new NotFoundError('No SystemAdministrator/KnowledgeCentreAdministrator user');
    return id;
  }
}

