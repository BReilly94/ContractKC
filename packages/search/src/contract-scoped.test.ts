import { describe, expect, it } from 'vitest';
import type { RetrievalChunk } from './interface.js';
import { OpenSearchClientImpl } from './opensearch-impl.js';

/**
 * Non-Negotiable #6 — Contract-scoped retrieval.
 *
 * `indexChunks` MUST refuse a chunk whose `contractId` differs from the
 * target contract — the indexer never lets a foreign chunk into a
 * namespace, which is defense-in-depth against a caller-side bug.
 *
 * We don't spin up OpenSearch for this test — we assert the pre-flight
 * check rejects the mismatch before any network call.
 */

describe('Non-Negotiable #6 — cross-contract chunk refuses to index', () => {
  it('indexChunks throws when a chunk contractId mismatches the target', async () => {
    const client = new OpenSearchClientImpl({ node: 'http://127.0.0.1:1', embeddingDim: 8 });
    const foreign: RetrievalChunk = {
      chunkId: 'foreign-1',
      contractId: 'B',
      text: 'text',
      source: { type: 'Document', id: 'doc-1' },
      metadata: {},
    };
    await expect(client.indexChunks('A', [foreign])).rejects.toThrow(/contractId mismatch/);
  });
});
