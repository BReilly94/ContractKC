import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import mssql from 'mssql';
import { AuthGuard } from '../common/auth.guard.js';
import { DB_POOL } from '../common/tokens.js';

export interface TagRow {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly category: string;
}

@Controller('api/tags')
@UseGuards(AuthGuard)
export class TagsController {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  @Get()
  async list(): Promise<TagRow[]> {
    const r = await this.pool
      .request()
      .query<TagRow>(`SELECT id, slug, label, category FROM tag ORDER BY category, label`);
    return r.recordset;
  }
}
