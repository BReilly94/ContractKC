import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';
import { closePool, getPool } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

async function ensureMigrationsTable(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '_migrations')
    BEGIN
      CREATE TABLE _migrations (
        filename    VARCHAR(256) NOT NULL PRIMARY KEY,
        applied_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    END
  `);
}

async function alreadyApplied(
  pool: mssql.ConnectionPool,
  filename: string,
): Promise<boolean> {
  const r = await pool
    .request()
    .input('filename', mssql.VarChar(256), filename)
    .query('SELECT 1 AS present FROM _migrations WHERE filename = @filename');
  return r.recordset.length > 0;
}

async function splitAndExecute(
  pool: mssql.ConnectionPool,
  tx: mssql.Transaction,
  sql: string,
): Promise<void> {
  const statements = sql
    .split(/^\s*GO\s*$/gim)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    const req = new mssql.Request(tx);
    await req.query(stmt);
  }
}

async function applyMigration(
  pool: mssql.ConnectionPool,
  filename: string,
  sql: string,
): Promise<void> {
  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
    await splitAndExecute(pool, tx, sql);
    await new mssql.Request(tx)
      .input('filename', mssql.VarChar(256), filename)
      .query('INSERT INTO _migrations (filename) VALUES (@filename)');
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = await getPool(connectionString);
  await ensureMigrationsTable(pool);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.warn('No migration files found');
    return;
  }
  for (const filename of files) {
    if (await alreadyApplied(pool, filename)) {
      console.warn(`[skip] ${filename} already applied`);
      continue;
    }
    console.warn(`[apply] ${filename}`);
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    await applyMigration(pool, filename, sql);
  }
  console.warn('Migrations complete');
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  try {
    await runMigrations(url);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts')) {
  await main();
}
