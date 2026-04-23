import type { Principal } from '@ckb/auth';
import { utcNow } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

export interface NotificationRow {
  readonly id: string;
  readonly userId: string;
  readonly contractId: string | null;
  readonly kind: string;
  readonly subject: string;
  readonly body: string | null;
  readonly linkPath: string | null;
  readonly emailSent: boolean;
  readonly emailSentAt: Date | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

interface DbRow {
  id: string;
  user_id: string;
  contract_id: string | null;
  kind: string;
  subject: string;
  body: string | null;
  link_path: string | null;
  email_sent: boolean | number;
  email_sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
}

function mapRow(r: DbRow): NotificationRow {
  return {
    id: r.id,
    userId: r.user_id,
    contractId: r.contract_id,
    kind: r.kind,
    subject: r.subject,
    body: r.body,
    linkPath: r.link_path,
    emailSent: Boolean(r.email_sent),
    emailSentAt: r.email_sent_at,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async listForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationRow[]> {
    const limit = Math.min(options.limit ?? 50, 200);
    const where = options.unreadOnly ? 'AND read_at IS NULL' : '';
    const r = await this.pool
      .request()
      .input('user_id', mssql.Char(26), userId)
      .query<DbRow>(`
        SELECT TOP ${limit} id, user_id, contract_id, kind, subject, body, link_path,
               email_sent, email_sent_at, read_at, created_at
          FROM notification
         WHERE user_id = @user_id ${where}
         ORDER BY created_at DESC
      `);
    return r.recordset.map(mapRow);
  }

  async markRead(principal: Principal, id: string): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .input('user_id', mssql.Char(26), principal.userId)
      .input('read_at', mssql.DateTimeOffset, utcNow())
      .query(`
        UPDATE notification
           SET read_at = @read_at
         WHERE id = @id AND user_id = @user_id AND read_at IS NULL;
      `);
  }

  async markAllRead(principal: Principal): Promise<void> {
    await this.pool
      .request()
      .input('user_id', mssql.Char(26), principal.userId)
      .input('read_at', mssql.DateTimeOffset, utcNow())
      .query(`
        UPDATE notification
           SET read_at = @read_at
         WHERE user_id = @user_id AND read_at IS NULL;
      `);
  }
}
