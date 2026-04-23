import { createAuthProvider } from '@ckb/auth';
import { Global, Module } from '@nestjs/common';
import mssql from 'mssql';
import { closePool, getPool } from '../db/client.js';
import { DEV_USERS } from '../dev-users.js';
import { loadConfig, type AppConfig } from './config.js';
import { APP_CONFIG, AUTH_PROVIDER, DB_POOL } from './tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: async (): Promise<AppConfig> => {
        const { config } = await loadConfig();
        return config;
      },
    },
    {
      provide: DB_POOL,
      useFactory: async (config: AppConfig): Promise<mssql.ConnectionPool> =>
        getPool(config.databaseUrl),
      inject: [APP_CONFIG],
    },
    {
      provide: AUTH_PROVIDER,
      useFactory: (config: AppConfig) =>
        createAuthProvider({
          authMode: config.authMode,
          signingSecret: config.jwtSecret,
          devUsers: DEV_USERS,
        }),
      inject: [APP_CONFIG],
    },
  ],
  exports: [APP_CONFIG, DB_POOL, AUTH_PROVIDER],
})
export class GlobalsModule {
  async onApplicationShutdown(): Promise<void> {
    await closePool();
  }
}
