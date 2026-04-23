import type { RuntimeClients } from '@ckb/runtime';
import type { RuntimeConfig } from '@ckb/runtime';
import type { Logger } from '@ckb/shared';
import type mssql from 'mssql';

/**
 * Per-worker context — every job handler has what it needs without reaching
 * for module-level globals.
 */
export interface WorkerContext {
  readonly clients: RuntimeClients;
  readonly config: RuntimeConfig;
  readonly logger: Logger;
  readonly db: mssql.ConnectionPool;
}

export interface WorkerDefinition<TPayload> {
  readonly queueName: string;
  readonly concurrency: number;
  handle(payload: TPayload, ctx: WorkerContext): Promise<void>;
}

/**
 * Workers register by adding to this array. The main process walks it at
 * startup and calls `queue.consume(name, handler)` for each. Adding a worker
 * is a one-file import — no decorator plumbing.
 */
export type AnyWorker = WorkerDefinition<unknown>;

const REGISTERED: AnyWorker[] = [];

export function registerWorker<TPayload>(def: WorkerDefinition<TPayload>): void {
  REGISTERED.push(def as AnyWorker);
}

export function allWorkers(): readonly AnyWorker[] {
  return REGISTERED;
}
