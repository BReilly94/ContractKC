import { createLogger } from '@ckb/shared';
import { connectDb, createRuntimeClients, loadRuntimeConfig } from '@ckb/runtime';
import { allWorkers } from './registry.js';
// Side-effect imports: each file registers itself via registerWorker().
import './workers/heartbeat.js';
import './workers/email-ingest/index.js';
import './workers/malware-scan.js';
import './workers/ocr.js';
import './workers/embed-index.js';
import './workers/summary-generate.js';
import './workers/deadline-extract.js';
// Phase 1 workers land here as additional imports:
// import './workers/clause-extract.js';

async function main(): Promise<void> {
  const logger = createLogger('ckb-workers');
  logger.info('starting workers');

  const { config } = await loadRuntimeConfig();
  const clients = createRuntimeClients(config);
  const dbPool = await connectDb(config.databaseUrl);
  const ctx = { clients, config, logger, db: dbPool };

  const stops: Array<() => Promise<void>> = [];
  for (const w of allWorkers()) {
    const stop = await clients.queue.consume(
      w.queueName,
      async ({ payload }) => {
        await w.handle(payload, ctx);
      },
      { concurrency: w.concurrency },
    );
    stops.push(stop.stop);
    logger.info('worker started', { queueName: w.queueName, concurrency: w.concurrency });
  }

  // Seed a single heartbeat.
  await clients.queue.enqueue('worker.heartbeat.v1', { at: new Date().toISOString() });

  const shutdown = async (): Promise<void> => {
    logger.info('shutdown signal received, draining workers');
    for (const s of stops) {
      await s();
    }
    await clients.queue.close();
    await dbPool.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  logger.info('workers ready', { count: allWorkers().length });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[workers] fatal', err);
  process.exit(1);
});
