import {
  computeConfidence,
  runQaSynth,
  type ConfidenceLevel,
  type LLMClient,
} from '@ckb/ai';
import {
  HashEmbeddingProvider,
  type HybridQueryHit,
  type SearchClient,
} from '@ckb/search';
import type { Principal } from '@ckb/auth';
import { newUlid, sha256 } from '@ckb/shared';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL, LLM_CLIENT, SEARCH_CLIENT } from '../common/tokens.js';

/**
 * Q&A orchestration (§5.3).
 *
 *   1. Retrieve chunks from the contract's isolated index (hybrid BM25 + vector).
 *   2. Hand to qa-synth capability, which runs post-generation citation
 *      verification. Responses failing verification are BLOCKED and returned
 *      as a withhold + incident log (Non-Negotiable #1).
 *   3. Compute confidence from retrieval stats + citation coverage.
 *   4. Persist to query_log — reproducible record with the retrieval context
 *      hash pinned so we can replay the same retrieval deterministically.
 *
 * The retrieval context hash is SHA-256 of the sorted chunk IDs + the
 * capability version. Same question against the same index returns the
 * same hash.
 */

export interface QaRequest {
  readonly question: string;
  readonly topK?: number;
}

export interface QaResponse {
  readonly queryId: string;
  readonly answer: string;
  readonly blocked: boolean;
  readonly blockedReason: string | null;
  readonly confidence: ConfidenceLevel;
  readonly retrievalHits: number;
  readonly citations: ReadonlyArray<{
    readonly chunkId: string;
    readonly sourceType: string;
    readonly sourceId: string;
    readonly snippet: string;
  }>;
}

@Injectable()
export class QaService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(LLM_CLIENT) private readonly llm: LLMClient,
    @Inject(SEARCH_CLIENT) private readonly search: SearchClient,
  ) {}

  async ask(
    principal: Principal,
    contractId: string,
    request: QaRequest,
    correlationId: string,
  ): Promise<QaResponse> {
    const topK = request.topK ?? 8;

    // Retrieve from the contract-isolated namespace.
    const embedder = new HashEmbeddingProvider(this.search.embeddingDim);
    const [queryVec] = await embedder.embed([request.question]);
    await this.search.ensureNamespace(contractId);
    const retrievalReq = queryVec
      ? {
          contractId,
          query: request.question,
          queryVector: queryVec,
          topK,
          vectorWeight: 0.5,
        }
      : { contractId, query: request.question, topK };
    const result = await this.search.hybridQuery(retrievalReq);

    const hits = result.hits as readonly HybridQueryHit[];
    const retrievalHits = hits.length;
    const topScore = hits[0]?.score ?? 0;
    const meanScore =
      retrievalHits > 0
        ? hits.reduce((acc: number, h: HybridQueryHit) => acc + h.score, 0) / retrievalHits
        : 0;

    // Refuse early on zero retrieval — avoid an LLM call.
    const queryId = newUlid();
    if (retrievalHits === 0) {
      const confidence: ConfidenceLevel = 'insufficient_context';
      await this.persist({
        id: queryId,
        contractId,
        userId: principal.userId,
        capability: 'qa-synth',
        promptVersion: '1.0.0',
        modelTier: 'sonnet',
        modelActual: 'n/a',
        question: request.question,
        answer: 'The contract does not appear to address this question.',
        blocked: false,
        blockedReason: null,
        confidence,
        retrievalHits: 0,
        retrievalTopScore: null,
        retrievalContextHash: sha256('empty'),
        citedChunkIds: [],
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        correlationId,
      });
      return {
        queryId,
        answer: 'The contract does not appear to address this question.',
        blocked: false,
        blockedReason: null,
        confidence,
        retrievalHits: 0,
        citations: [],
      };
    }

    // Build the context hash BEFORE the LLM call so we can replay.
    const sortedIds = [...hits.map((h: HybridQueryHit) => h.chunkId)].sort();
    const retrievalContextHash = sha256(sortedIds.join('|') + '|qa-synth@1.0.0');

    const synth = await runQaSynth(this.llm, {
      question: request.question,
      chunks: hits.map((h: HybridQueryHit) => ({
        chunkId: h.chunkId,
        source: describeSource(h),
        text: h.text,
      })),
    });

    const nonRefusalSentences = synth.blocked
      ? 0
      : synth.answer.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;

    const confidence: ConfidenceLevel = synth.blocked
      ? 'low'
      : computeConfidence({
          retrievalHits,
          topScore,
          meanScore,
          citedChunkCount: synth.citedChunkIds.length,
          nonRefusalSentences,
        });

    await this.persist({
      id: queryId,
      contractId,
      userId: principal.userId,
      capability: 'qa-synth',
      promptVersion: synth.promptVersion,
      modelTier: 'sonnet',
      modelActual: 'sonnet',
      question: request.question,
      answer: synth.answer,
      blocked: synth.blocked,
      blockedReason: synth.blockedReason,
      confidence,
      retrievalHits,
      retrievalTopScore: topScore,
      retrievalContextHash,
      citedChunkIds: synth.citedChunkIds as string[],
      inputTokens: synth.inputTokens,
      outputTokens: synth.outputTokens,
      latencyMs: synth.latencyMs,
      correlationId,
    });

    const citations = synth.citedChunkIds.map((cid: string) => {
      const hit = hits.find((h: HybridQueryHit) => h.chunkId === cid);
      if (!hit) {
        return {
          chunkId: cid,
          sourceType: 'Unknown',
          sourceId: 'unknown',
          snippet: '',
        };
      }
      return {
        chunkId: cid,
        sourceType: hit.source.type,
        sourceId: hit.source.id,
        snippet: hit.text.slice(0, 200),
      };
    });

    return {
      queryId,
      answer: synth.answer,
      blocked: synth.blocked,
      blockedReason: synth.blockedReason,
      confidence,
      retrievalHits,
      citations,
    };
  }

  async feedback(
    principal: Principal,
    queryId: string,
    thumb: 'up' | 'down',
    comment: string | null,
  ): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), newUlid())
      .input('query_log_id', mssql.Char(26), queryId)
      .input('user_id', mssql.Char(26), principal.userId)
      .input('thumb', mssql.VarChar(4), thumb)
      .input('comment', mssql.NVarChar(2000), comment)
      .query(`
        INSERT INTO query_feedback (id, query_log_id, user_id, thumb, comment)
        VALUES (@id, @query_log_id, @user_id, @thumb, @comment);
      `);
  }

  async getContractIdForQuery(queryId: string): Promise<string | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), queryId)
      .query<{ contract_id: string }>(
        `SELECT contract_id FROM query_log WHERE id = @id`,
      );
    return r.recordset[0]?.contract_id ?? null;
  }

  private async persist(args: {
    id: string;
    contractId: string;
    userId: string;
    capability: string;
    promptVersion: string;
    modelTier: string;
    modelActual: string;
    question: string;
    answer: string;
    blocked: boolean;
    blockedReason: string | null;
    confidence: ConfidenceLevel;
    retrievalHits: number;
    retrievalTopScore: number | null;
    retrievalContextHash: string;
    citedChunkIds: string[];
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    correlationId: string;
  }): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Char(26), args.id)
      .input('contract_id', mssql.Char(26), args.contractId)
      .input('user_id', mssql.Char(26), args.userId)
      .input('capability', mssql.VarChar(40), args.capability)
      .input('prompt_version', mssql.VarChar(64), args.promptVersion)
      .input('model_tier', mssql.VarChar(16), args.modelTier)
      .input('model_actual', mssql.VarChar(64), args.modelActual)
      .input('question', mssql.NVarChar(mssql.MAX), args.question)
      .input('answer', mssql.NVarChar(mssql.MAX), args.answer)
      .input('blocked', mssql.Bit, args.blocked ? 1 : 0)
      .input('blocked_reason', mssql.NVarChar(1024), args.blockedReason)
      .input('confidence', mssql.VarChar(24), args.confidence)
      .input('retrieval_hits', mssql.Int, args.retrievalHits)
      .input('retrieval_top_score', mssql.Float, args.retrievalTopScore)
      .input('retrieval_context_hash', mssql.Char(64), args.retrievalContextHash)
      .input('cited_chunk_ids', mssql.NVarChar(mssql.MAX), JSON.stringify(args.citedChunkIds))
      .input('input_tokens', mssql.Int, args.inputTokens)
      .input('output_tokens', mssql.Int, args.outputTokens)
      .input('latency_ms', mssql.Int, args.latencyMs)
      .input('correlation_id', mssql.Char(26), args.correlationId)
      .query(`
        INSERT INTO query_log
          (id, contract_id, user_id, capability, prompt_version,
           model_tier, model_actual, question, answer, blocked, blocked_reason,
           confidence, retrieval_hits, retrieval_top_score, retrieval_context_hash,
           cited_chunk_ids, input_tokens, output_tokens, latency_ms, correlation_id)
        VALUES
          (@id, @contract_id, @user_id, @capability, @prompt_version,
           @model_tier, @model_actual, @question, @answer, @blocked, @blocked_reason,
           @confidence, @retrieval_hits, @retrieval_top_score, @retrieval_context_hash,
           @cited_chunk_ids, @input_tokens, @output_tokens, @latency_ms, @correlation_id);
      `);
  }
}

function describeSource(hit: {
  source: { type: string; id: string; pageStart?: number; messageId?: string; clauseNumber?: string };
}): string {
  const s = hit.source;
  if (s.type === 'Document') {
    return `Document ${s.id}${s.pageStart ? ` p.${s.pageStart}` : ''}`;
  }
  if (s.type === 'Email') return `Email ${s.id}`;
  if (s.type === 'Clause')
    return `Clause ${s.clauseNumber ?? s.id}`;
  return `${s.type} ${s.id}`;
}
