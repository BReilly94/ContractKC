import { createLogger } from '@ckb/shared';
import { createRuntimeClients, loadRuntimeConfig } from '@ckb/runtime';
import { startFolderWatcher } from './folder-watcher.js';
import { buildWebhookServer } from './webhook-server.js';

async function main(): Promise<void> {
  const logger = createLogger('ckb-ingestion');
  logger.info('starting ingestion');

  const { config, secrets } = await loadRuntimeConfig();
  const clients = createRuntimeClients(config);

  const webhookSecret = await secrets.get('INGESTION_WEBHOOK_SECRET');

  const deps = { storage: clients.storage, queue: clients.queue, logger };

  const server = buildWebhookServer({
    hmacSecret: webhookSecret,
    deps,
  });

  const port = Number(process.env['INGESTION_PORT'] ?? 4001);
  // Bind to localhost for the local-dev webhook; Azure/gateway deployment exposes
  // the SendGrid path separately with its own TLS termination.
  await server.listen({ port, host: '127.0.0.1' });
  logger.info('ingestion webhook listening', { port });

  const watcher = startFolderWatcher({
    inboxDir: config.emailInboxDir,
    processedDir: config.emailProcessedDir,
    emailDomain: config.emailDomain,
    deps,
    logger,
  });
  logger.info('folder watcher started', {
    inboxDir: config.emailInboxDir,
    processedDir: config.emailProcessedDir,
  });

  const shutdown = async (): Promise<void> => {
    logger.info('shutdown signal received');
    await watcher.stop();
    await server.close();
    await clients.queue.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[ingestion] fatal', err);
  process.exit(1);
});
