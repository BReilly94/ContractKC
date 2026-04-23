import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { createAuthProvider } from '@ckb/auth';
import type { AuthProvider } from '@ckb/auth';
import type { User } from '@ckb/domain';
import { asBrandedId, newUlid } from '@ckb/shared';
import mssql from 'mssql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessModule } from '../access/access.module.js';
import { CorrelationMiddleware } from '../common/correlation.middleware.js';
import { GlobalExceptionFilter } from '../common/exception.filter.js';
import { APP_CONFIG, AUTH_PROVIDER, DB_POOL } from '../common/tokens.js';
import type { AppConfig } from '../common/config.js';
import { getPool, closePool } from '../db/client.js';
import { HealthModule } from '../health/health.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { UsersModule } from '../users/users.module.js';
import { ContractsModule } from './contracts.module.js';

const DATABASE_URL = process.env.DATABASE_URL;
const describeIf = DATABASE_URL ? describe : describe.skip;

function buildTestUser(id: string, overrides: Partial<User> = {}): User {
  return {
    id: asBrandedId<'User'>(id),
    email: `${id}@test.local`,
    displayName: id,
    globalRole: 'Standard',
    isPm: false,
    canCreateContracts: false,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

describeIf('contracts API — integration (NN #2, NN #5)', () => {
  let app: INestApplication;
  let pool: mssql.ConnectionPool;
  let authProvider: AuthProvider;
  let brianToken: string;
  let danaToken: string;
  let samToken: string;

  const brianId = newUlid();
  const danaId = newUlid();
  const samId = newUlid();
  const partyId = newUlid();

  const brian = buildTestUser(brianId, {
    globalRole: 'SystemAdministrator',
    canCreateContracts: true,
  });
  const dana = buildTestUser(danaId, { isPm: true });
  const sam = buildTestUser(samId);

  beforeAll(async () => {
    pool = await getPool(DATABASE_URL!);

    for (const u of [brian, dana, sam]) {
      await pool
        .request()
        .input('id', mssql.Char(26), u.id)
        .input('email', mssql.VarChar(320), u.email)
        .input('display_name', mssql.NVarChar(128), u.displayName)
        .input('global_role', mssql.VarChar(40), u.globalRole)
        .input('is_pm', mssql.Bit, u.isPm ? 1 : 0)
        .input('can_create_contracts', mssql.Bit, u.canCreateContracts ? 1 : 0)
        .query(`
          INSERT INTO app_user (id, email, display_name, global_role, is_pm, can_create_contracts)
          VALUES (@id, @email, @display_name, @global_role, @is_pm, @can_create_contracts);
        `);
    }

    await pool
      .request()
      .input('id', mssql.Char(26), partyId)
      .input('name', mssql.NVarChar(256), `Test Client ${partyId}`)
      .input('created_by_user_id', mssql.Char(26), brianId)
      .query(`
        INSERT INTO party (id, name, created_by_user_id) VALUES (@id, @name, @created_by_user_id);
      `);

    const testAppConfig: AppConfig = {
      apiPort: 0,
      webBaseUrl: 'http://localhost:3000',
      databaseUrl: DATABASE_URL!,
      authMode: 'local-dev',
      providerMode: 'local',
      jwtSecret: 'test-signing-secret-sixteen-plus-chars',
      nodeEnv: 'test',
    };

    authProvider = createAuthProvider({
      authMode: 'local-dev',
      signingSecret: testAppConfig.jwtSecret,
      devUsers: [brian, dana, sam],
    });
    brianToken = await authProvider.issueDevToken(brian.id);
    danaToken = await authProvider.issueDevToken(dana.id);
    samToken = await authProvider.issueDevToken(sam.id);

    @Global()
    @Module({
      providers: [
        { provide: APP_CONFIG, useValue: testAppConfig },
        { provide: DB_POOL, useValue: pool },
        { provide: AUTH_PROVIDER, useValue: authProvider },
      ],
      exports: [APP_CONFIG, DB_POOL, AUTH_PROVIDER],
    })
    class TestGlobalsModule {}

    @Module({
      imports: [
        TestGlobalsModule,
        HealthModule,
        ContractsModule,
        AccessModule,
        PartiesModule,
        UsersModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
    })
    class TestAppModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        consumer.apply(CorrelationMiddleware).forRoutes('*');
      }
    }

    app = await NestFactory.create(TestAppModule, { logger: false });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await closePool();
  });

  it('POST /api/contracts requires can_create_contracts', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${danaToken}`)
      .send({
        name: 'Attempted by non-admin',
        clientPartyId: partyId,
        responsiblePmUserId: danaId,
        currency: 'CAD',
        startDate: '2026-05-01',
        governingLaw: 'CA-ON',
      });
    expect(res.status).toBe(403);
  });

  it('POST /api/contracts creates a contract in Onboarding with summary + aliases + audit', async () => {
    const contractName = `NN-5 Test Contract ${newUlid()}`;
    const res = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${brianToken}`)
      .send({
        name: contractName,
        clientPartyId: partyId,
        responsiblePmUserId: danaId,
        contractValueCents: 1_000_000_00,
        currency: 'CAD',
        startDate: '2026-05-01',
        endDate: '2027-04-30',
        governingLaw: 'CA-ON',
        confidentialityClass: 'Standard',
        language: 'en',
      });
    expect(res.status).toBe(201);
    expect(res.body.lifecycleState).toBe('Onboarding');
    expect(res.body.summaryVerificationState).toBe('Unverified');
    expect(res.body.vectorNamespace).toMatch(/^ckb-contract-[0-9a-z]{26}$/);
    expect(res.body.projectEmailAddress).toContain('@contracts.technicamining.com');

    const audit = await pool
      .request()
      .input('entity_id', mssql.VarChar(64), res.body.id)
      .query(
        'SELECT action FROM audit_log WHERE entity_id = @entity_id ORDER BY sequence_number ASC',
      );
    const actions = audit.recordset.map((r: { action: string }) => r.action);
    expect(actions).toContain('contract.create');
  });

  it('(NN #5) Sam cannot see contracts he has no grant on; list is empty and detail is 404', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${brianToken}`)
      .send({
        name: `NN-5 Private Contract ${newUlid()}`,
        clientPartyId: partyId,
        responsiblePmUserId: danaId,
        currency: 'CAD',
        startDate: '2026-05-01',
        governingLaw: 'CA-ON',
      });
    expect(createRes.status).toBe(201);
    const contractId = createRes.body.id;

    const samList = await request(app.getHttpServer())
      .get('/api/contracts')
      .set('Authorization', `Bearer ${samToken}`);
    expect(samList.status).toBe(200);
    const samIds = samList.body.map((c: { id: string }) => c.id);
    expect(samIds).not.toContain(contractId);

    const samDetail = await request(app.getHttpServer())
      .get(`/api/contracts/${contractId}`)
      .set('Authorization', `Bearer ${samToken}`);
    expect(samDetail.status).toBe(404);

    const brianDetail = await request(app.getHttpServer())
      .get(`/api/contracts/${contractId}`)
      .set('Authorization', `Bearer ${brianToken}`);
    expect(brianDetail.status).toBe(200);
    expect(brianDetail.body.id).toBe(contractId);
  });

  it('(NN #5) unauthenticated requests get 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/contracts');
    expect(res.status).toBe(401);
  });

  it('(NN #2) PATCH lifecycle rejects Onboarding → Active while summary is Unverified', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${brianToken}`)
      .send({
        name: `NN-2 Unverified Test ${newUlid()}`,
        clientPartyId: partyId,
        responsiblePmUserId: danaId,
        currency: 'CAD',
        startDate: '2026-05-01',
        governingLaw: 'CA-ON',
      });
    expect(createRes.status).toBe(201);
    const contractId = createRes.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/api/contracts/${contractId}/lifecycle`)
      .set('Authorization', `Bearer ${brianToken}`)
      .send({ targetState: 'Active' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('(NN #2) same transition succeeds after summary is manually flipped to Verified', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${brianToken}`)
      .send({
        name: `NN-2 Verified Test ${newUlid()}`,
        clientPartyId: partyId,
        responsiblePmUserId: danaId,
        currency: 'CAD',
        startDate: '2026-05-01',
        governingLaw: 'CA-ON',
      });
    const contractId = createRes.body.id;
    const summaryId = createRes.body.summaryId;

    await pool
      .request()
      .input('id', mssql.Char(26), summaryId)
      .input('verifier', mssql.Char(26), brianId)
      .query(`
        UPDATE contract_summary
           SET verification_state = 'Verified',
               verified_by_user_id = @verifier,
               verified_at = SYSDATETIMEOFFSET()
         WHERE id = @id;
      `);

    const res = await request(app.getHttpServer())
      .patch(`/api/contracts/${contractId}/lifecycle`)
      .set('Authorization', `Bearer ${brianToken}`)
      .send({ targetState: 'Active' });
    expect(res.status).toBe(200);
    expect(res.body.lifecycleState).toBe('Active');
  });
});
