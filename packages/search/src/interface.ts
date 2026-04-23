/**
 * Per-contract isolated retrieval index.
 *
 * Non-Negotiable #6 lands here: every index operation takes a `contractId`,
 * and cross-contract queries are impossible through this surface — the impl
 * resolves a contract-specific index name and refuses to read from any other.
 *
 * The unit of retrieval is a chunk. A chunk always carries back-references to
 * its source (document/email/clause) so the citation verifier (packages/ai)
 * can resolve a cited chunk to a concrete anchor.
 */

export type ContractId = string;

export type ChunkSourceType = 'Document' | 'Email' | 'Clause';

export interface ChunkSource {
  readonly type: ChunkSourceType;
  readonly id: string;
  /** Optional document version for clause/doc sources — keeps citations stable across revisions. */
  readonly documentVersionId?: string;
  /** 1-indexed page range for PDF sources, nullable for emails. */
  readonly pageStart?: number;
  readonly pageEnd?: number;
  /** Character offsets into the normalized text layer for deep-linking. */
  readonly charOffsetStart?: number;
  readonly charOffsetEnd?: number;
  /** Email message-id for Email sources. */
  readonly messageId?: string;
  /** Clause number for Clause sources, if numbered. */
  readonly clauseNumber?: string;
}

export interface RetrievalChunk {
  readonly chunkId: string;
  readonly contractId: ContractId;
  readonly text: string;
  /** Optional precomputed embedding; if omitted, the impl must embed at index time. */
  readonly embedding?: readonly number[];
  readonly source: ChunkSource;
  /** Free-form filters — category, tag, language, sender, date. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface HybridQueryRequest {
  readonly contractId: ContractId;
  readonly query: string;
  /** Optional pre-embedded query vector. If omitted, pure BM25 is used. */
  readonly queryVector?: readonly number[];
  readonly topK?: number;
  readonly filters?: Readonly<Record<string, string | number | boolean>>;
  /** Mix weight for vector vs. BM25 score. Defaults to 0.5 each. */
  readonly vectorWeight?: number;
}

export interface HybridQueryHit {
  readonly chunkId: string;
  readonly score: number;
  readonly text: string;
  readonly source: ChunkSource;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface HybridQueryResult {
  readonly hits: readonly HybridQueryHit[];
  readonly took: number;
}

export interface IndexStats {
  readonly contractId: ContractId;
  readonly docCount: number;
}

export interface SearchClient {
  readonly mode: 'local' | 'azure';
  readonly embeddingDim: number;
  ensureNamespace(contractId: ContractId): Promise<void>;
  deleteNamespace(contractId: ContractId): Promise<void>;
  indexChunks(contractId: ContractId, chunks: readonly RetrievalChunk[]): Promise<void>;
  deleteBySource(contractId: ContractId, source: ChunkSourceType, id: string): Promise<void>;
  hybridQuery(request: HybridQueryRequest): Promise<HybridQueryResult>;
  stats(contractId: ContractId): Promise<IndexStats>;
}

export class CrossContractQueryRefused extends Error {
  constructor(readonly attempted: ContractId, readonly actualNamespace: string) {
    super(
      `Refusing cross-contract query: attempted=${attempted} actualNamespace=${actualNamespace} (Non-Negotiable #6)`,
    );
    this.name = 'CrossContractQueryRefused';
  }
}
