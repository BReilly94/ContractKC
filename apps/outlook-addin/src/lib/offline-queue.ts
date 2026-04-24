/**
 * Offline queue for the "Send to Contract" action.
 *
 * Non-Negotiable #7 forbids browser storage of contract content. The SOW
 * carves out two explicit exceptions:
 *
 *   (a) offline diary drafts   (SOW §6.6)
 *   (b) Outlook add-in offline queuing with sync-on-reconnect  (SOW §6.18)
 *
 * This file is exception (b). It stores queued forward-requests in IndexedDB
 * keyed by an auto-assigned id. A queued entry holds the base64 .eml and the
 * target contractId; it is retried when the browser goes back online. On
 * success the entry is deleted.
 *
 * DO NOT repurpose this helper for general-purpose contract caching. Any new
 * store or non-"queue" usage must route through a reviewed design.
 */

import { forwardEmailToContract, type ForwardEmailResult } from './api-client.js';

export interface QueuedForward {
  readonly id: number;
  readonly contractId: string;
  readonly contractName: string;
  readonly subject: string;
  readonly envelopeFrom: string | undefined;
  readonly emlBase64: string;
  readonly queuedAt: string;
  readonly attempts: number;
  readonly lastError: string | null;
}

export type QueuedForwardInit = Omit<QueuedForward, 'id' | 'attempts' | 'lastError' | 'queuedAt'>;

const DB_NAME = 'ckb-outlook-addin';
const DB_VERSION = 1;
const STORE = 'pending-forwards';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'));
  });
}

function txWith<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexeddb op failed'));
      }),
  );
}

export async function enqueueForward(init: QueuedForwardInit): Promise<number> {
  const record = {
    ...init,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  const key = await txWith<IDBValidKey>('readwrite', (s) => s.add(record));
  return typeof key === 'number' ? key : Number(key);
}

export async function listQueuedForwards(): Promise<readonly QueuedForward[]> {
  const all = await txWith<QueuedForward[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedForward[]>);
  return all;
}

export async function deleteQueuedForward(id: number): Promise<void> {
  await txWith<undefined>('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

async function updateQueuedForward(entry: QueuedForward): Promise<void> {
  await txWith<IDBValidKey>('readwrite', (s) => s.put(entry));
}

export interface FlushOutcome {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly results: ReadonlyArray<{
    readonly id: number;
    readonly ok: boolean;
    readonly error?: string;
    readonly result?: ForwardEmailResult;
  }>;
}

/**
 * Attempts to flush every pending item. Bails out on the first network
 * failure (no point retrying the rest if we are offline); other errors (e.g.
 * 4xx from the API) are recorded per-item without stopping the loop.
 */
export async function flushQueue(token: string): Promise<FlushOutcome> {
  const pending = await listQueuedForwards();
  const results: Array<{
    id: number;
    ok: boolean;
    error?: string;
    result?: ForwardEmailResult;
  }> = [];
  let succeeded = 0;
  let failed = 0;
  for (const item of pending) {
    try {
      const result = await forwardEmailToContract(
        token,
        item.contractId,
        item.emlBase64,
        item.envelopeFrom,
      );
      await deleteQueuedForward(item.id);
      succeeded += 1;
      results.push({ id: item.id, ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Network-off / DNS errors surface as TypeError in fetch. Stop the loop
      // so we don't burn through attempts; next online event will retry.
      const isNetwork = err instanceof TypeError;
      const next: QueuedForward = {
        ...item,
        attempts: item.attempts + 1,
        lastError: message,
      };
      await updateQueuedForward(next);
      failed += 1;
      results.push({ id: item.id, ok: false, error: message });
      if (isNetwork) break;
    }
  }
  return { processed: results.length, succeeded, failed, results };
}
