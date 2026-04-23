import { registerWorker } from '../registry.js';

/**
 * Heartbeat worker — logs on every minute, proves the stack is alive end-to-end.
 * Drivable via a cron job: `queue.enqueue('worker.heartbeat.v1', {}, { delayMs: ... })`
 * Phase 0 keeps it as a no-op consumer; main.ts seeds one enqueue at boot.
 */
registerWorker<{ at: string }>({
  queueName: 'worker.heartbeat.v1',
  concurrency: 1,
  async handle(payload, ctx) {
    ctx.logger.info('heartbeat received', { at: payload.at });
  },
});
