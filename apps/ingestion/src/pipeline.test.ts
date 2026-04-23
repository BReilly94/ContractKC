import { describe, expect, it } from 'vitest';
import { createLogger } from '@ckb/shared';
import { acceptInboundEmail } from './pipeline.js';
import type { StorageClient, PutResult } from '@ckb/storage';
import type { QueueClient } from '@ckb/queue';

function makeFakeStorage(existing: Set<string> = new Set()): StorageClient {
  return {
    mode: 'local',
    async put(path, _bytes, options): Promise<PutResult> {
      const created = !existing.has(path);
      if (options?.ifNoneMatch === '*' && existing.has(path)) {
        return { path, sizeBytes: 0, etag: 'existing', created: false };
      }
      existing.add(path);
      return { path, sizeBytes: _bytes.length, etag: 'fresh', created };
    },
    async get(): Promise<Buffer> {
      throw new Error('not used');
    },
    async stat() {
      return null;
    },
    async exists() {
      return false;
    },
    async delete() {
      // no-op
    },
  };
}

function makeFakeQueue(enqueued: Array<{ queueName: string; payload: unknown; jobId?: string }>): QueueClient {
  return {
    mode: 'local',
    async enqueue(queueName, payload, options) {
      const jobId = options?.jobId ?? `auto-${Math.random()}`;
      enqueued.push({ queueName, payload, jobId });
      return { jobId };
    },
    async consume() {
      return { stop: async () => undefined };
    },
    async failedJobs() {
      return [];
    },
    async close() {},
  };
}

describe('acceptInboundEmail', () => {
  const logger = createLogger('test', 'warn');

  it('hashes + stores immutably + enqueues on first accept', async () => {
    const enqueued: Array<{ queueName: string; payload: unknown; jobId?: string }> = [];
    const storage = makeFakeStorage();
    const queue = makeFakeQueue(enqueued);

    const result = await acceptInboundEmail(
      {
        rawBytes: Buffer.from('raw .eml bytes'),
        envelopeTo: ['redlake-expansion@contracts.technicamining.com'],
        envelopeFrom: 'client@example.com',
        provider: 'LocalFolderWatcher',
        source: 'test',
      },
      { storage, queue, logger },
    );

    expect(result.rawEmlSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.blobPath).toBe(`sha256/${result.rawEmlSha256}/raw.eml`);
    expect(result.alreadySeen).toBe(false);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.queueName).toBe('email.ingest.v1');
    expect(enqueued[0]?.jobId).toBe(
      `${result.rawEmlSha256}:redlake-expansion@contracts.technicamining.com`,
    );
  });

  it('marks alreadySeen when the content-addressed blob exists (Non-Negotiable #3)', async () => {
    const existing = new Set<string>();
    const enqueued: Array<{ queueName: string; payload: unknown; jobId?: string }> = [];
    const storage = makeFakeStorage(existing);
    const queue = makeFakeQueue(enqueued);

    const bytes = Buffer.from('duplicate');
    const first = await acceptInboundEmail(
      {
        rawBytes: bytes,
        envelopeTo: ['a@contracts.technicamining.com'],
        envelopeFrom: 'x@example.com',
        provider: 'LocalFolderWatcher',
        source: 'first',
      },
      { storage, queue, logger },
    );
    expect(first.alreadySeen).toBe(false);

    const second = await acceptInboundEmail(
      {
        rawBytes: bytes,
        envelopeTo: ['a@contracts.technicamining.com'],
        envelopeFrom: 'x@example.com',
        provider: 'LocalFolderWatcher',
        source: 'second',
      },
      { storage, queue, logger },
    );
    expect(second.alreadySeen).toBe(true);
    expect(second.blobPath).toBe(first.blobPath);

    // Both enqueue attempts used the same jobId → queue-layer dedup handles idempotency.
    expect(enqueued).toHaveLength(2);
    expect(enqueued[0]?.jobId).toBe(enqueued[1]?.jobId);
  });
});
