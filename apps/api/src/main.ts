import 'reflect-metadata';
import { createLogger } from '@ckb/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_CONFIG } from './common/tokens.js';
import type { AppConfig } from './common/config.js';

const log = createLogger('api', 'info');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableCors({
    origin: config.webBaseUrl,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
  });

  await app.listen(config.apiPort);
  log.info('API listening', { port: config.apiPort, authMode: config.authMode });
}

bootstrap().catch((err) => {
  log.error('Bootstrap failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
