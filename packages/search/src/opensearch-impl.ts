import { Client } from '@opensearch-project/opensearch';
import type {
  ChunkSourceType,
  ContractId,
  HybridQueryRequest,
  HybridQueryResult,
  IndexStats,
  RetrievalChunk,
  SearchClient,
} from './interface.js';

const INDEX_PREFIX = 'ckb-contract-';

export interface OpenSearchConfig {
  readonly node: string;
  readonly embeddingDim: number;
  readonly indexPrefix?: string;
}

function namespaceFor(contractId: ContractId, prefix = INDEX_PREFIX): string {
  return `${prefix}${contractId.toLowerCase()}`;
}

interface SourceDoc {
  contract_id: string;
  text: string;
  embedding?: number[];
  source_type: string;
  source_id: string;
  source_metadata: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export class OpenSearchClientImpl implements SearchClient {
  readonly mode: 'local' | 'azure' = 'local';
  readonly embeddingDim: number;
  private readonly client: Client;
  private readonly indexPrefix: string;

  constructor(config: OpenSearchConfig) {
    this.client = new Client({ node: config.node });
    this.embeddingDim = config.embeddingDim;
    this.indexPrefix = config.indexPrefix ?? INDEX_PREFIX;
  }

  async ensureNamespace(contractId: ContractId): Promise<void> {
    const index = namespaceFor(contractId, this.indexPrefix);
    const exists = await this.client.indices.exists({ index });
    if (exists.body) return;
    await this.client.indices.create({
      index,
      body: {
        settings: {
          index: {
            knn: true,
            number_of_shards: 1,
            number_of_replicas: 0,
          },
        },
        mappings: {
          properties: {
            contract_id: { type: 'keyword' },
            text: { type: 'text' },
            embedding: {
              type: 'knn_vector',
              dimension: this.embeddingDim,
              method: { name: 'hnsw', space_type: 'cosinesimil', engine: 'nmslib' },
            },
            source_type: { type: 'keyword' },
            source_id: { type: 'keyword' },
            source_metadata: { type: 'object', enabled: false },
            metadata: { type: 'flat_object' },
          },
        },
      },
    });
  }

  async deleteNamespace(contractId: ContractId): Promise<void> {
    const index = namespaceFor(contractId, this.indexPrefix);
    try {
      await this.client.indices.delete({ index });
    } catch (err) {
      const status = (err as { meta?: { statusCode?: number } }).meta?.statusCode;
      if (status !== 404) throw err;
    }
  }

  async indexChunks(contractId: ContractId, chunks: readonly RetrievalChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const index = namespaceFor(contractId, this.indexPrefix);
    const operations: Record<string, unknown>[] = [];
    for (const c of chunks) {
      if (c.contractId !== contractId) {
        // Defence in depth — refuse to index a foreign chunk.
        throw new Error(`Chunk ${c.chunkId} contractId mismatch`);
      }
      const doc: SourceDoc = {
        contract_id: contractId,
        text: c.text,
        source_type: c.source.type,
        source_id: c.source.id,
        source_metadata: {
          documentVersionId: c.source.documentVersionId,
          pageStart: c.source.pageStart,
          pageEnd: c.source.pageEnd,
          charOffsetStart: c.source.charOffsetStart,
          charOffsetEnd: c.source.charOffsetEnd,
          messageId: c.source.messageId,
          clauseNumber: c.source.clauseNumber,
        },
        metadata: { ...c.metadata },
      };
      if (c.embedding && c.embedding.length > 0) doc.embedding = [...c.embedding];
      operations.push({ index: { _index: index, _id: c.chunkId } });
      operations.push(doc as unknown as Record<string, unknown>);
    }
    const resp = await this.client.bulk({ body: operations, refresh: false });
    if (resp.body.errors === true) {
      const first = (resp.body.items as Array<Record<string, { error?: { reason?: string } }>>)
        .map((item) => Object.values(item)[0]?.error?.reason)
        .find(Boolean);
      throw new Error(`Bulk index failures: ${first ?? 'unknown'}`);
    }
  }

  async deleteBySource(
    contractId: ContractId,
    sourceType: ChunkSourceType,
    id: string,
  ): Promise<void> {
    const index = namespaceFor(contractId, this.indexPrefix);
    await this.client.deleteByQuery({
      index,
      body: {
        query: {
          bool: {
            filter: [{ term: { source_type: sourceType } }, { term: { source_id: id } }],
          },
        },
      },
      refresh: true,
    });
  }

  async hybridQuery(request: HybridQueryRequest): Promise<HybridQueryResult> {
    const index = namespaceFor(request.contractId, this.indexPrefix);
    const topK = request.topK ?? 10;

    const filters: Array<Record<string, unknown>> = [
      { term: { contract_id: request.contractId } },
    ];
    if (request.filters) {
      for (const [k, v] of Object.entries(request.filters)) {
        filters.push({ term: { [`metadata.${k}`]: v } });
      }
    }

    const vectorWeight = request.queryVector ? request.vectorWeight ?? 0.5 : 0;
    const bm25Weight = 1 - vectorWeight;

    const queries: Array<Record<string, unknown>> = [];
    if (bm25Weight > 0) {
      queries.push({
        bool: {
          must: [{ match: { text: { query: request.query, boost: bm25Weight } } }],
          filter: filters,
        },
      });
    }
    if (request.queryVector && vectorWeight > 0) {
      queries.push({
        bool: {
          must: [
            {
              knn: {
                embedding: {
                  vector: [...request.queryVector],
                  k: topK,
                  boost: vectorWeight,
                },
              },
            },
          ],
          filter: filters,
        },
      });
    }

    const body =
      queries.length === 1
        ? { query: queries[0] }
        : { query: { bool: { should: queries, minimum_should_match: 1, filter: filters } } };

    const resp = await this.client.search({
      index,
      body: { ...body, size: topK, _source: true },
    });

    type Hit = {
      _id: string;
      _score: number;
      _source: SourceDoc;
    };
    const hits = (resp.body.hits.hits as Hit[]).map((h) => ({
      chunkId: h._id,
      score: h._score,
      text: h._source.text,
      source: {
        type: h._source.source_type as ChunkSourceType,
        id: h._source.source_id,
        ...h._source.source_metadata,
      },
      metadata: h._source.metadata as Record<string, string | number | boolean | null>,
    }));
    return { hits, took: (resp.body as { took?: number }).took ?? 0 };
  }

  async stats(contractId: ContractId): Promise<IndexStats> {
    const index = namespaceFor(contractId, this.indexPrefix);
    const resp = await this.client.count({ index });
    return { contractId, docCount: Number(resp.body.count ?? 0) };
  }
}
