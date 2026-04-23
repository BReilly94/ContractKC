import { AsyncLocalStorage } from 'node:async_hooks';
import { newUlid } from './ids.js';

export interface CorrelationContext {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export function newCorrelationId(): string {
  return newUlid();
}

export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function requireCorrelationId(): string {
  const id = getCorrelationId();
  if (!id) throw new Error('No correlation id in context');
  return id;
}
