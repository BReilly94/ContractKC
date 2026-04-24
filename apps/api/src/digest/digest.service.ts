import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import {
  ALL_DIGEST_CATEGORIES,
  type DigestCategory,
  type DigestChannel,
  type DigestFrequency,
  type DigestPreference,
} from '@ckb/domain';
import { ForbiddenError, newUlid, utcNow } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

/**
 * Digest preferences (Slice II — §6.23).
 *
 * The user owns their preferences. A global/KC admin can read any user's
 * preferences but cannot edit them — those are personal. System admins can
 * also view for support, again read-only. Updates are self-service only.
 */

export interface DigestPreferenceRow {
  readonly id: string;
  readonly userId: string;
  readonly contractId: string | null;
  readonly frequency: DigestFrequency;
  readonly channels: readonly DigestChannel[];
  readonly categories: readonly DigestCategory[];
  readonly lastDispatchedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DbRow {
  id: string;
  user_id: string;
  contract_id: string | null;
  frequency: DigestFrequency;
  channels: string;
  categories: string;
  last_dispatched_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: DbRow): DigestPreferenceRow {
  return {
    id: r.id,
    userId: r.user_id,
    contractId: r.contract_id,
    frequency: r.frequency,
    channels: JSON.parse(r.channels) as DigestChannel[],
    categories: JSON.parse(r.categories) as DigestCategory[],
    lastDispatchedAt: r.last_dispatched_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface UpsertPreferenceInput {
  readonly contractId: string | null;
  readonly frequency: DigestFrequency;
  readonly channels: readonly DigestChannel[];
  readonly categories: readonly DigestCategory[];
}

const SELECT = `
  SELECT id, user_id, contract_id, frequency, channels, categories,
         last_dispatched_at, created_at, updated_at
    FROM digest_preference
`;

@Injectable()
export class DigestService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listForUser(userId: string): Promise<DigestPreferenceRow[]> {
    const r = await this.pool
      .request()
      .input('user_id', mssql.Char(26), userId)
      .query<DbRow>(`${SELECT} WHERE user_id = @user_id ORDER BY contract_id ASC`);
    return r.recordset.map(mapRow);
  }

  async upsert(
    principal: Principal,
    targetUserId: string,
    input: UpsertPreferenceInput,
    correlationId: string,
  ): Promise<DigestPreferenceRow> {
    // Personal: only the user themselves may change their preferences.
    // System administrators cannot override (prevents silently muting
    // someone's notifications).
    if (principal.userId !== targetUserId) {
      throw new ForbiddenError(
        'Digest preferences are personal — only the user may edit them',
      );
    }
    const channels = Array.from(new Set(input.channels));
    const categories = Array.from(new Set(input.categories));

    const tx = new mssql.Transaction(this.pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    let id: string;
    try {
      // Look up existing row. The partial-unique indexes make this a
      // single-row test per scope.
      const existingQ = await new mssql.Request(tx)
        .input('user_id', mssql.Char(26), targetUserId)
        .input('contract_id', mssql.Char(26), input.contractId)
        .query<{ id: string }>(
          input.contractId === null
            ? `SELECT id FROM digest_preference WHERE user_id = @user_id AND contract_id IS NULL`
            : `SELECT id FROM digest_preference WHERE user_id = @user_id AND contract_id = @contract_id`,
        );
      const existing = existingQ.recordset[0];
      const before = existing
        ? await new mssql.Request(tx)
            .input('id', mssql.Char(26), existing.id)
            .query<DbRow>(`${SELECT} WHERE id = @id`)
        : null;
      const beforeRow = before?.recordset[0] ? mapRow(before.recordset[0]) : null;

      if (existing) {
        id = existing.id;
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), existing.id)
          .input('frequency', mssql.VarChar(16), input.frequency)
          .input('channels', mssql.NVarChar(256), JSON.stringify(channels))
          .input('categories', mssql.NVarChar(1024), JSON.stringify(categories))
          .query(`
            UPDATE digest_preference
               SET frequency = @frequency,
                   channels = @channels,
                   categories = @categories,
                   updated_at = SYSDATETIMEOFFSET()
             WHERE id = @id;
          `);
      } else {
        id = newUlid();
        await new mssql.Request(tx)
          .input('id', mssql.Char(26), id)
          .input('user_id', mssql.Char(26), targetUserId)
          .input('contract_id', mssql.Char(26), input.contractId)
          .input('frequency', mssql.VarChar(16), input.frequency)
          .input('channels', mssql.NVarChar(256), JSON.stringify(channels))
          .input('categories', mssql.NVarChar(1024), JSON.stringify(categories))
          .query(`
            INSERT INTO digest_preference
              (id, user_id, contract_id, frequency, channels, categories)
            VALUES
              (@id, @user_id, @contract_id, @frequency, @channels, @categories);
          `);
      }
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'digest_preference.update',
        entityType: 'DigestPreference',
        entityId: id,
        before: beforeRow
          ? {
              frequency: beforeRow.frequency,
              channels: beforeRow.channels,
              categories: beforeRow.categories,
            }
          : null,
        after: { contractId: input.contractId, frequency: input.frequency, channels, categories },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<DbRow>(`${SELECT} WHERE id = @id`);
    const row = r.recordset[0];
    if (!row) throw new Error('Digest preference disappeared after upsert');
    return mapRow(row);
  }

  /**
   * Defaults used by the digest worker when no preference row exists.
   * Weekly InApp across every category keeps users softly informed
   * without spamming mail — they can tighten or mute per-contract.
   */
  systemDefault(userId: string): DigestPreference {
    const now = utcNow();
    return {
      id: 'default-system' as unknown as DigestPreference['id'],
      userId: userId as unknown as DigestPreference['userId'],
      contractId: null,
      frequency: 'Weekly',
      channels: ['InApp'],
      categories: ALL_DIGEST_CATEGORIES,
      lastDispatchedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}
