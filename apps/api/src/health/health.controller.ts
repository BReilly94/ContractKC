import { Controller, Get, Inject } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL } from '../common/tokens.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  @Get()
  async liveness(): Promise<{ status: 'ok'; db: 'up' | 'down' }> {
    let db: 'up' | 'down' = 'down';
    try {
      const r = await this.pool.request().query('SELECT 1 AS ok');
      db = r.recordset[0]?.ok === 1 ? 'up' : 'down';
    } catch {
      db = 'down';
    }
    return { status: 'ok', db };
  }
}
