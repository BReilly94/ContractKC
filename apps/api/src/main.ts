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

  // Uploads arrive as base64 JSON; default 100kb blows up past ~70KB of file.
  // SOW §9 target is 100MB — 150mb covers base64 inflation.
  app.useBodyParser('json', { limit: '150mb' });

  const config = app.get<AppConfig>(APP_CONFIG);
  const isLocalDev = config.authMode === 'local-dev';
  app.enableCors({
    origin: (requestOrigin, cb) => {
      if (!requestOrigin) return cb(null, true); // same-origin / tools
      if (requestOrigin === config.webBaseUrl) return cb(null, true);
      // Accept Codespaces forwarded-port origins in local-dev mode only —
      // never in production (AUTH_MODE=local-dev is forbidden there anyway).
      if (isLocalDev && /\.app\.github\.dev$/.test(new URL(requestOrigin).hostname)) {
        return cb(null, true);
      }
      cb(new Error(`Origin not allowed: ${requestOrigin}`));
    },
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
