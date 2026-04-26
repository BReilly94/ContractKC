/**
 * Queue abstraction. BullMQ+Redis locally; a Service Bus implementation
 * will slot in behind this interface at Azure cutover.
 *
 * Queue names are stringly-typed on purpose — adding a queue is a one-file
 * change in the caller, not a type hierarchy edit. Payload shapes are each
 * caller's concern; they can plug Zod validation at their boundary.
 */

export type QueueName = string;

export interface EnqueueOptions {
  /** Idempotency key — re-enqueuing the same key is a no-op. */
  readonly jobId?: string;
  /** Delay in ms before the job becomes runnable. */
  readonly delayMs?: number;
  /** Max retry attempts. Defaults to 1 (no retry). */
  readonly attempts?: number;
  /** Backoff strategy when attempts > 1. */
  readonly backoff?: {
    readonly type: 'exponential' | 'fixed';
    /** Base delay in ms. Exponential: delay * 2^attempt. Fixed: constant delay. */
    readonly delayMs: number;
  };
}

export interface JobContext<TPayload> {
  readonly jobId: string;
  readonly queueName: QueueName;
  readonly attemptsMade: number;
  readonly payload: TPayload;
  readonly enqueuedAt: Date;
}

export type JobHandler<TPayload> = (ctx: JobContext<TPayload>) => Promise<void>;

export interface ConsumeOptions {
  readonly concurrency?: number;
}

export interface FailedJob {
  readonly jobId: string;
  readonly queueName: QueueName;
  readonly payload: unknown;
  readonly reason: string;
  readonly failedAt: Date;
  readonly attemptsMade: number;
}

export interface QueueClient {
  readonly mode: 'local' | 'azure';
  enqueue<TPayload>(
    queueName: QueueName,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<{ jobId: string }>;
  consume<TPayload>(
    queueName: QueueName,
    handler: JobHandler<TPayload>,
    options?: ConsumeOptions,
  ): Promise<{ stop: () => Promise<void> }>;
  failedJobs(queueName: QueueName, limit?: number): Promise<FailedJob[]>;
  close(): Promise<void>;
}
