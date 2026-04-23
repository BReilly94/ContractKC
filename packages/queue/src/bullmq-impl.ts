import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type {
  ConsumeOptions,
  EnqueueOptions,
  FailedJob,
  JobContext,
  JobHandler,
  QueueClient,
  QueueName,
} from './interface.js';

export class BullMqQueueClient implements QueueClient {
  readonly mode: 'local' | 'azure' = 'local';
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly connection: Redis;

  constructor(redisUrl: string) {
    // BullMQ requires maxRetriesPerRequest: null on the blocking connection.
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  private getOrCreateQueue(queueName: QueueName): Queue {
    let q = this.queues.get(queueName);
    if (!q) {
      q = new Queue(queueName, { connection: this.connection });
      this.queues.set(queueName, q);
    }
    return q;
  }

  async enqueue<TPayload>(
    queueName: QueueName,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<{ jobId: string }> {
    const queue = this.getOrCreateQueue(queueName);
    const jobOptions: Record<string, unknown> = {};
    if (options.jobId !== undefined) jobOptions['jobId'] = options.jobId;
    if (options.delayMs !== undefined) jobOptions['delay'] = options.delayMs;
    if (options.attempts !== undefined) jobOptions['attempts'] = options.attempts;
    const job = await queue.add(queueName, payload as unknown, jobOptions);
    return { jobId: String(job.id) };
  }

  async consume<TPayload>(
    queueName: QueueName,
    handler: JobHandler<TPayload>,
    options: ConsumeOptions = {},
  ): Promise<{ stop: () => Promise<void> }> {
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const ctx: JobContext<TPayload> = {
          jobId: String(job.id),
          queueName,
          attemptsMade: job.attemptsMade ?? 0,
          payload: job.data as TPayload,
          enqueuedAt: new Date(job.timestamp),
        };
        await handler(ctx);
      },
      {
        connection: this.connection.duplicate(),
        concurrency: options.concurrency ?? 1,
      },
    );
    this.workers.push(worker);
    return {
      stop: async (): Promise<void> => {
        await worker.close();
      },
    };
  }

  async failedJobs(queueName: QueueName, limit = 50): Promise<FailedJob[]> {
    const queue = this.getOrCreateQueue(queueName);
    const jobs = await queue.getFailed(0, limit - 1);
    return jobs.map((j) => ({
      jobId: String(j.id),
      queueName,
      payload: j.data,
      reason: j.failedReason ?? 'unknown',
      failedAt: new Date(j.finishedOn ?? Date.now()),
      attemptsMade: j.attemptsMade ?? 0,
    }));
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}
