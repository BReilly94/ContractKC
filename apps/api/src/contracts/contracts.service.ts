import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  canonicalAddress,
  canonicalLocalPart,
  evaluateTransitionGate,
  validateHumanAlias,
  type ContractLifecycleState,
  type ContractRole,
  type ContractId,
} from '@ckb/domain';
import {
  asBrandedId,
  ConflictError,
  ForbiddenError,
  newUlid,
  NotFoundError,
  ValidationError,
  utcNow,
} from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';
import type { CreateContractBody } from './dtos.js';

export interface ContractRow {
  readonly id: string;
  readonly name: string;
  readonly clientPartyId: string;
  readonly responsiblePmUserId: string;
  readonly contractValueCents: number | null;
  readonly currency: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly governingLaw: string;
  readonly confidentialityClass: string;
  readonly language: string;
  readonly lifecycleState: ContractLifecycleState;
  readonly vectorNamespace: string;
  readonly projectEmailAddress: string;
  readonly projectEmailAlias: string | null;
  readonly summaryId: string | null;
  readonly summaryVerificationState: 'Unverified' | 'Verified' | 'Superseded' | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbContractRow {
  id: string;
  name: string;
  client_party_id: string;
  responsible_pm_user_id: string;
  contract_value_cents: number | string | null;
  currency: string;
  start_date: Date | string;
  end_date: Date | string | null;
  governing_law: string;
  confidentiality_class: string;
  language: string;
  lifecycle_state: ContractLifecycleState;
  vector_namespace: string;
  project_email_address: string;
  project_email_alias: string | null;
  summary_id: string | null;
  verification_state: 'Unverified' | 'Verified' | 'Superseded' | null;
  created_at: Date;
  updated_at: Date;
}

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function mapContractRow(r: DbContractRow): ContractRow {
  return {
    id: r.id,
    name: r.name,
    clientPartyId: r.client_party_id,
    responsiblePmUserId: r.responsible_pm_user_id,
    contractValueCents:
      r.contract_value_cents === null
        ? null
        : typeof r.contract_value_cents === 'string'
          ? Number(r.contract_value_cents)
          : r.contract_value_cents,
    currency: r.currency.trim(),
    startDate: isoDate(r.start_date),
    endDate: r.end_date === null ? null : isoDate(r.end_date),
    governingLaw: r.governing_law,
    confidentialityClass: r.confidentiality_class,
    language: r.language,
    lifecycleState: r.lifecycle_state,
    vectorNamespace: r.vector_namespace,
    projectEmailAddress: r.project_email_address,
    projectEmailAlias: r.project_email_alias,
    summaryId: r.summary_id,
    summaryVerificationState: r.verification_state,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const CONTRACT_SELECT = `
  SELECT c.id, c.name, c.client_party_id, c.responsible_pm_user_id,
         c.contract_value_cents, c.currency, c.start_date, c.end_date,
         c.governing_law, c.confidentiality_class, c.language, c.lifecycle_state,
         c.vector_namespace, c.project_email_address, c.project_email_alias,
         c.summary_id, cs.verification_state,
         c.created_at, c.updated_at
    FROM contract c
    LEFT JOIN contract_summary cs ON cs.id = c.summary_id
`;

@Injectable()
export class ContractsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async create(
    principal: Principal,
    body: CreateContractBody,
    correlationId: string,
  ): Promise<ContractRow> {
    if (!principal.user.canCreateContracts) {
      throw new ForbiddenError('User is not permitted to create contracts');
    }
    if (body.humanEmailAlias) {
      const validation = validateHumanAlias(body.humanEmailAlias);
      if (!validation.valid) {
        throw new ValidationError(`Invalid human email alias: ${validation.reason}`);
      }
    }

    const contractId = newUlid();
    const contractIdBranded = asBrandedId<'Contract'>(contractId);
    const summaryId = newUlid();
    const canonicalLp = canonicalLocalPart(contractIdBranded);
    const canonicalAddr = canonicalAddress(contractIdBranded);
    const vectorNamespace = `ckb-contract-${contractId.toLowerCase()}`;
    const now = utcNow();

    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      await this.assertPartyExists(tx, body.clientPartyId);
      await this.assertUserExists(tx, body.responsiblePmUserId, { mustBePm: true });

      await new mssql.Request(tx)
        .input('id', mssql.Char(26), contractId)
        .input('name', mssql.NVarChar(256), body.name)
        .input('client_party_id', mssql.Char(26), body.clientPartyId)
        .input('responsible_pm_user_id', mssql.Char(26), body.responsiblePmUserId)
        .input('contract_value_cents', mssql.BigInt, body.contractValueCents ?? null)
        .input('currency', mssql.Char(3), body.currency)
        .input('start_date', mssql.Date, body.startDate)
        .input('end_date', mssql.Date, body.endDate ?? null)
        .input('governing_law', mssql.VarChar(40), body.governingLaw)
        .input('confidentiality_class', mssql.VarChar(32), body.confidentialityClass)
        .input('language', mssql.VarChar(10), body.language)
        .input('lifecycle_state', mssql.VarChar(32), 'Onboarding')
        .input('vector_namespace', mssql.VarChar(128), vectorNamespace)
        .input('project_email_address', mssql.VarChar(320), canonicalAddr)
        .input('project_email_alias', mssql.VarChar(320), body.humanEmailAlias
          ? `${body.humanEmailAlias}@contracts.technicamining.com`
          : null)
        .input('created_at', mssql.DateTimeOffset, now)
        .input('updated_at', mssql.DateTimeOffset, now)
        .query(`
          INSERT INTO contract
            (id, name, client_party_id, responsible_pm_user_id, contract_value_cents,
             currency, start_date, end_date, governing_law, confidentiality_class,
             language, lifecycle_state, vector_namespace, project_email_address,
             project_email_alias, created_at, updated_at)
          VALUES
            (@id, @name, @client_party_id, @responsible_pm_user_id, @contract_value_cents,
             @currency, @start_date, @end_date, @governing_law, @confidentiality_class,
             @language, @lifecycle_state, @vector_namespace, @project_email_address,
             @project_email_alias, @created_at, @updated_at);
        `);

      await new mssql.Request(tx)
        .input('id', mssql.Char(26), summaryId)
        .input('contract_id', mssql.Char(26), contractId)
        .query(`
          INSERT INTO contract_summary (id, contract_id, verification_state)
          VALUES (@id, @contract_id, 'Unverified');
        `);

      await new mssql.Request(tx)
        .input('summary_id', mssql.Char(26), summaryId)
        .input('contract_id', mssql.Char(26), contractId)
        .query(`UPDATE contract SET summary_id = @summary_id WHERE id = @contract_id;`);

      await this.insertEmailAlias(tx, {
        id: newUlid(),
        contractId,
        localPart: canonicalLp,
        canonicalAddress: canonicalAddr,
        humanAlias: null,
        aliasType: 'Canonical',
      });
      if (body.humanEmailAlias) {
        const humanAddr = `${body.humanEmailAlias}@contracts.technicamining.com`;
        await this.insertEmailAlias(tx, {
          id: newUlid(),
          contractId,
          localPart: body.humanEmailAlias,
          canonicalAddress: humanAddr,
          humanAlias: body.humanEmailAlias,
          aliasType: 'Human',
        });
      }

      const roles = new Map<string, ContractRole>();
      roles.set(principal.userId, 'Owner');
      if (body.responsiblePmUserId !== principal.userId) {
        roles.set(body.responsiblePmUserId, 'Administrator');
      }
      for (const g of body.additionalGrants) {
        if (!roles.has(g.userId)) roles.set(g.userId, g.role);
      }
      for (const [userId, role] of roles) {
        const grantId = newUlid();
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), grantId)
          .input('contract_id', mssql.Char(26), contractId)
          .input('user_id', mssql.Char(26), userId)
          .input('contract_role', mssql.VarChar(32), role)
          .input('granted_by_user_id', mssql.Char(26), principal.userId)
          .query(`
            INSERT INTO contract_access (id, contract_id, user_id, contract_role, granted_by_user_id)
            VALUES (@id, @contract_id, @user_id, @contract_role, @granted_by_user_id);
          `);
        await logAudit(tx, {
          actorUserId: principal.userId,
          action: 'contract_access.grant',
          entityType: 'ContractAccess',
          entityId: grantId,
          after: { contractId, userId, role },
          correlationId,
        });
      }

      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contract.create',
        entityType: 'Contract',
        entityId: contractId,
        after: {
          id: contractId,
          name: body.name,
          clientPartyId: body.clientPartyId,
          responsiblePmUserId: body.responsiblePmUserId,
          currency: body.currency,
          confidentialityClass: body.confidentialityClass,
        },
        correlationId,
      });
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contract_summary.create',
        entityType: 'ContractSummary',
        entityId: summaryId,
        after: { contractId, verificationState: 'Unverified' },
        correlationId,
      });
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'email_alias.create',
        entityType: 'EmailAlias',
        entityId: canonicalLp,
        after: { contractId, aliasType: 'Canonical', canonicalAddress: canonicalAddr },
        correlationId,
      });

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      if (err instanceof mssql.RequestError && err.number === 2627) {
        throw new ConflictError('Duplicate key — alias or contract already exists');
      }
      throw err;
    }

    const created = await this.findById(contractId);
    if (!created) throw new Error('Contract disappeared after create');
    return created;
  }

  async findById(id: string): Promise<ContractRow | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbContractRow>(`${CONTRACT_SELECT} WHERE c.id = @id`);
    const row = result.recordset[0];
    return row ? mapContractRow(row) : null;
  }

  async listForUser(userId: string): Promise<ContractRow[]> {
    const result = await this.pool
      .request()
      .input('user_id', mssql.Char(26), userId)
      .query<DbContractRow>(`
        ${CONTRACT_SELECT}
        WHERE EXISTS (
          SELECT 1 FROM contract_access a
          WHERE a.contract_id = c.id AND a.user_id = @user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM contract_access_revocation r
          WHERE r.contract_id = c.id AND r.user_id = @user_id AND r.reversed_at IS NULL
        )
        ORDER BY c.created_at DESC
      `);
    return result.recordset.map(mapContractRow);
  }

  async transitionLifecycle(
    principal: Principal,
    contractId: string,
    targetState: ContractLifecycleState,
    correlationId: string,
  ): Promise<ContractRow> {
    const current = await this.findById(contractId);
    if (!current) throw new NotFoundError('Contract not found');

    const gate = evaluateTransitionGate({
      from: current.lifecycleState,
      to: targetState,
      summaryVerificationState: current.summaryVerificationState ?? 'Unverified',
    });
    if (gate) {
      if (gate.code === 'IllegalTransition') {
        throw new ValidationError(
          `Illegal transition: ${gate.from} → ${gate.to}`,
          { code: gate.code, from: gate.from, to: gate.to },
        );
      }
      throw new ValidationError(
        `Contract summary is not verified (Non-Negotiable #2); cannot transition ${gate.from} → ${gate.to}`,
        { code: gate.code, from: gate.from, to: gate.to },
      );
    }

    // Slice HH — §6.21 archive gate. Query the closeout checklist inline
    // to avoid the ContractsModule ↔ CloseoutModule import cycle. Keeps
    // the service layer self-contained; the CloseoutService wraps the
    // same check for admin UIs.
    if (current.lifecycleState === 'Closeout' && targetState === 'Archived') {
      const check = await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .query<{ pending_count: number; has_checklist: number }>(`
          SELECT
            (CASE WHEN EXISTS (SELECT 1 FROM closeout_checklist WHERE contract_id = @contract_id)
                  THEN 1 ELSE 0 END) AS has_checklist,
            (SELECT COUNT(*)
               FROM closeout_checklist_item i
               JOIN closeout_checklist c ON c.id = i.checklist_id
              WHERE c.contract_id = @contract_id AND i.status = 'Pending') AS pending_count;
        `);
      const hasChecklist = Boolean(check.recordset[0]?.has_checklist);
      const pendingCount = check.recordset[0]?.pending_count ?? 0;
      if (!hasChecklist) {
        throw new ValidationError(
          'Cannot archive: contract has no closeout checklist (§6.21)',
          { code: 'NoChecklist' },
        );
      }
      if (pendingCount > 0) {
        throw new ValidationError(
          `Cannot archive: ${pendingCount} closeout item(s) still Pending (§6.21 HUMAN GATE)`,
          { code: 'ItemsOutstanding', pendingCount },
        );
      }
    }

    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), contractId)
        .input('new_state', mssql.VarChar(32), targetState)
        .input('old_state', mssql.VarChar(32), current.lifecycleState)
        .query(`
          UPDATE contract
             SET lifecycle_state = @new_state, updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id AND lifecycle_state = @old_state;
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'contract.lifecycle.transition',
        entityType: 'Contract',
        entityId: contractId,
        before: { lifecycleState: current.lifecycleState },
        after: { lifecycleState: targetState },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const updated = await this.findById(contractId);
    if (!updated) throw new Error('Contract disappeared after transition');
    return updated;
  }

  private async assertPartyExists(tx: mssql.Transaction, partyId: string): Promise<void> {
    const r = await new mssql.Request(tx)
      .input('id', mssql.Char(26), partyId)
      .query('SELECT TOP 1 id FROM party WHERE id = @id');
    if (r.recordset.length === 0) {
      throw new ValidationError(`Party ${partyId} not found`);
    }
  }

  private async assertUserExists(
    tx: mssql.Transaction,
    userId: string,
    options: { mustBePm: boolean },
  ): Promise<void> {
    const r = await new mssql.Request(tx)
      .input('id', mssql.Char(26), userId)
      .query<{ is_pm: boolean }>('SELECT TOP 1 is_pm FROM app_user WHERE id = @id');
    if (r.recordset.length === 0) {
      throw new ValidationError(`User ${userId} not found`);
    }
    if (options.mustBePm && !r.recordset[0]?.is_pm) {
      throw new ValidationError(`User ${userId} is not flagged as PM`);
    }
  }

  private async insertEmailAlias(
    tx: mssql.Transaction,
    args: {
      id: string;
      contractId: string;
      localPart: string;
      canonicalAddress: string;
      humanAlias: string | null;
      aliasType: 'Canonical' | 'Human';
    },
  ): Promise<void> {
    await new mssql.Request(tx)
      .input('id', mssql.Char(26), args.id)
      .input('contract_id', mssql.Char(26), args.contractId)
      .input('local_part', mssql.VarChar(64), args.localPart)
      .input('canonical_address', mssql.VarChar(320), args.canonicalAddress)
      .input('human_alias', mssql.VarChar(64), args.humanAlias)
      .input('alias_type', mssql.VarChar(16), args.aliasType)
      .query(`
        INSERT INTO email_alias
          (id, contract_id, local_part, canonical_address, human_alias, alias_type, active, provisioned_externally)
        VALUES
          (@id, @contract_id, @local_part, @canonical_address, @human_alias, @alias_type, 1, 0);
      `);
  }
}
