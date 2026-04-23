import { newUlid, runWithCorrelation } from '@ckb/shared';
import mssql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeRowHash } from './hash-chain.js';
import { queryAuditLog, verifyChain } from './reader.js';
import { logAudit } from './writer.js';
import type { UserId } from '@ckb/domain';
import { asBrandedId } from '@ckb/shared';

const DATABASE_URL = process.env.DATABASE_URL;
const describeIf = DATABASE_URL ? describe : describe.skip;

function parseUrl(url: string): mssql.config {
  const m = url.match(
    /^sqlserver:\/\/([^:]+):([^@]+)@([^:;]+)(?::(\d+))?;database=([^;]+)(.*)$/,
  );
  if (!m) throw new Error(`Unparseable DATABASE_URL: ${url}`);
  const [, user, password, host, portStr, database, rest] = m;
  if (!user || !password || !host || !database) {
    throw new Error('DATABASE_URL missing required fields');
  }
  const encrypt = !/encrypt=false/i.test(rest ?? '');
  const trust = /trustServerCertificate=true/i.test(rest ?? '');
  return {
    server: host,
    port: portStr ? Number(portStr) : 1433,
    user,
    password,
    database,
    options: { encrypt, trustServerCertificate: trust },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
  };
}

describeIf('audit writer — integration (NN #4)', () => {
  let pool: mssql.ConnectionPool;
  let testUserId: UserId;
  const correlationId = newUlid();

  beforeAll(async () => {
    pool = new mssql.ConnectionPool(parseUrl(DATABASE_URL!));
    await pool.connect();
    const rawId = newUlid();
    testUserId = asBrandedId<'User'>(rawId);
    await pool
      .request()
      .input('id', mssql.Char(26), rawId)
      .input('email', mssql.VarChar(320), `audit-test-${rawId}@test.local`)
      .query(
        `INSERT INTO app_user (id, email, display_name, global_role)
         VALUES (@id, @email, 'Audit Test User', 'Standard')`,
      );
  }, 30_000);

  afterAll(async () => {
    await pool?.close();
  });

  async function runInTx<T>(fn: (tx: mssql.Transaction) => Promise<T>): Promise<T> {
    const tx = new mssql.Transaction(pool);
    await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  it('(a) writes succeed and return the expected hash chain fields', async () => {
    const entry = await runWithCorrelation(correlationId, () =>
      runInTx((tx) =>
        logAudit(tx, {
          actorUserId: testUserId,
          action: 'user.create',
          entityType: 'User',
          entityId: testUserId,
          after: { id: testUserId, displayName: 'Audit Test User' },
        }),
      ),
    );
    expect(entry.id).toHaveLength(26);
    expect(entry.rowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('(b.1) UPDATE on audit_log is blocked by trigger (Non-Negotiable #4)', async () => {
    await expect(
      pool
        .request()
        .query(`UPDATE TOP (1) audit_log SET action = 'contract.update'`),
    ).rejects.toThrow(/append-only/i);
  });

  it('(b.2) DELETE on audit_log is blocked by trigger (Non-Negotiable #4)', async () => {
    await expect(
      pool.request().query(`DELETE TOP (1) FROM audit_log`),
    ).rejects.toThrow(/append-only/i);
  });

  it('(c) hash chain holds across 50 sequential writes', async () => {
    for (let i = 0; i < 50; i++) {
      await runWithCorrelation(correlationId, () =>
        runInTx((tx) =>
          logAudit(tx, {
            actorUserId: testUserId,
            action: 'contract.create',
            entityType: 'Contract',
            entityId: `chain-test-${i.toString().padStart(3, '0')}`,
            after: { sequence: i },
          }),
        ),
      );
    }
    const verification = await verifyChain(pool);
    expect(verification.ok).toBe(true);
  }, 30_000);

  it('(d) tampering with a row (bypassing triggers) breaks chain verification', async () => {
    const rowsBefore = await queryAuditLog(pool, { limit: 1 });
    expect(rowsBefore.length).toBeGreaterThan(0);
    const target = rowsBefore[0]!;

    await pool.request().query('DISABLE TRIGGER trg_audit_log_no_update ON audit_log');
    try {
      await pool
        .request()
        .input('seq', mssql.BigInt, target.sequenceNumber)
        .query(
          `UPDATE audit_log SET after_json = '{"tampered":true}' WHERE sequence_number = @seq`,
        );
    } finally {
      await pool.request().query('ENABLE TRIGGER trg_audit_log_no_update ON audit_log');
    }

    const verification = await verifyChain(pool);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.reason).toBe('HashMismatch');
    }

    // Restore the row so subsequent test runs start clean.
    const restored = computeRowHash({
      id: target.id,
      actorUserId: target.actorUserId,
      action: target.action,
      entityType: target.entityType,
      entityId: target.entityId,
      beforeJson: target.beforeJson,
      afterJson: target.afterJson,
      correlationId: target.correlationId,
      createdAt: target.createdAt,
      prevHash: target.prevHash,
    });
    expect(restored).toBe(target.rowHash);

    await pool.request().query('DISABLE TRIGGER trg_audit_log_no_update ON audit_log');
    try {
      await pool
        .request()
        .input('seq', mssql.BigInt, target.sequenceNumber)
        .input('after_json', mssql.NVarChar(mssql.MAX), target.afterJson)
        .query(
          `UPDATE audit_log SET after_json = @after_json WHERE sequence_number = @seq`,
        );
    } finally {
      await pool.request().query('ENABLE TRIGGER trg_audit_log_no_update ON audit_log');
    }
    const rehab = await verifyChain(pool);
    expect(rehab.ok).toBe(true);
  }, 30_000);
});
