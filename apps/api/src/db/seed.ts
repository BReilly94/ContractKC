import { newUlid } from '@ckb/shared';
import mssql from 'mssql';
import { DEV_USERS } from '../dev-users.js';
import { closePool, getPool } from './client.js';

async function seedUsers(pool: mssql.ConnectionPool): Promise<void> {
  for (const u of DEV_USERS) {
    await pool
      .request()
      .input('id', mssql.Char(26), u.id)
      .input('email', mssql.VarChar(320), u.email)
      .input('display_name', mssql.NVarChar(128), u.displayName)
      .input('global_role', mssql.VarChar(40), u.globalRole)
      .input('is_pm', mssql.Bit, u.isPm ? 1 : 0)
      .input('can_create_contracts', mssql.Bit, u.canCreateContracts ? 1 : 0)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM app_user WHERE id = @id)
        BEGIN
          INSERT INTO app_user (id, email, display_name, global_role, is_pm, can_create_contracts)
          VALUES (@id, @email, @display_name, @global_role, @is_pm, @can_create_contracts);
        END
        ELSE
        BEGIN
          UPDATE app_user
             SET email = @email,
                 display_name = @display_name,
                 global_role = @global_role,
                 is_pm = @is_pm,
                 can_create_contracts = @can_create_contracts
           WHERE id = @id;
        END
      `);
  }
  console.warn(`[seed] upserted ${DEV_USERS.length} dev users`);
}

async function seedParty(pool: mssql.ConnectionPool): Promise<void> {
  const brian = DEV_USERS[0]!;
  const existing = await pool
    .request()
    .input('name', mssql.NVarChar(256), 'Goldcorp (Dev Fixture)')
    .query<{ id: string }>('SELECT id FROM party WHERE name = @name');
  if (existing.recordset.length > 0) {
    console.warn('[seed] party Goldcorp already exists');
    return;
  }
  const id = newUlid();
  await pool
    .request()
    .input('id', mssql.Char(26), id)
    .input('name', mssql.NVarChar(256), 'Goldcorp (Dev Fixture)')
    .input('created_by_user_id', mssql.Char(26), brian.id)
    .query(`
      INSERT INTO party (id, name, created_by_user_id)
      VALUES (@id, @name, @created_by_user_id);
    `);
  console.warn(`[seed] created party Goldcorp (Dev Fixture) (${id})`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  try {
    const pool = await getPool(url);
    await seedUsers(pool);
    await seedParty(pool);
    console.warn('[seed] done');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

await main();
