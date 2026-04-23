import type { SearchClient } from '@ckb/search';
import { HashEmbeddingProvider } from '@ckb/search';
import { Inject, Injectable } from '@nestjs/common';
import mssql from 'mssql';
import { DB_POOL, SEARCH_CLIENT } from '../common/tokens.js';

/**
 * Global search (§5.8) — unified keyword + metadata search across emails,
 * documents, tags, and retrieved chunks. Non-Negotiable #6 is enforced at
 * two layers:
 *   1. Every SQL path includes `contract_id = @contract_id`.
 *   2. The retrieval hit is scoped by SearchClient namespace.
 */

export interface SearchHitEmail {
  readonly kind: 'Email';
  readonly id: string;
  readonly contractId: string;
  readonly subject: string;
  readonly fromAddress: string;
  readonly receivedAt: Date;
  readonly snippet: string;
}

export interface SearchHitDocument {
  readonly kind: 'Document';
  readonly id: string;
  readonly contractId: string;
  readonly category: string;
  readonly originalFilename: string;
  readonly uploadedAt: Date;
  readonly snippet: string;
}

export interface SearchHitChunk {
  readonly kind: 'Chunk';
  readonly chunkId: string;
  readonly contractId: string;
  readonly sourceType: 'Document' | 'Email' | 'Clause';
  readonly sourceId: string;
  readonly text: string;
  readonly score: number;
}

export type SearchHit = SearchHitEmail | SearchHitDocument | SearchHitChunk;

export interface SearchResult {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly tookMs: number;
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(DB_POOL) private readonly pool: mssql.ConnectionPool,
    @Inject(SEARCH_CLIENT) private readonly searchClient: SearchClient,
  ) {}

  async run(
    contractId: string,
    query: string,
    options: {
      documentType?: string;
      includeEmails?: boolean;
      includeDocuments?: boolean;
      includeChunks?: boolean;
    } = {},
  ): Promise<SearchResult> {
    const t0 = Date.now();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { query: trimmed, hits: [], tookMs: Date.now() - t0 };
    }

    const wantEmails = options.includeEmails !== false;
    const wantDocs = options.includeDocuments !== false;
    const wantChunks = options.includeChunks !== false;

    const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
    const hits: SearchHit[] = [];

    if (wantEmails) {
      const er = await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .input('q', mssql.NVarChar(256), like)
        .query<{
          id: string;
          subject: string;
          from_address: string;
          received_at: Date;
          body_text: string | null;
        }>(`
          SELECT TOP 25 id, subject, from_address, received_at, body_text
            FROM email
           WHERE contract_id = @contract_id
             AND duplicate_of_email_id IS NULL
             AND sender_trust_state = 'Approved'
             AND (subject LIKE @q ESCAPE '\\'
                  OR from_address LIKE @q ESCAPE '\\'
                  OR body_text LIKE @q ESCAPE '\\')
           ORDER BY received_at DESC
        `);
      for (const row of er.recordset) {
        hits.push({
          kind: 'Email',
          id: row.id,
          contractId,
          subject: row.subject,
          fromAddress: row.from_address,
          receivedAt: row.received_at,
          snippet: makeSnippet(row.body_text ?? row.subject, trimmed),
        });
      }
    }

    if (wantDocs) {
      const dr = await this.pool
        .request()
        .input('contract_id', mssql.Char(26), contractId)
        .input('q', mssql.NVarChar(256), like)
        .query<{
          id: string;
          category: string;
          original_filename: string;
          uploaded_at: Date;
        }>(`
          SELECT TOP 25 id, category, original_filename, uploaded_at
            FROM document
           WHERE contract_id = @contract_id
             AND malware_scan_status = 'Clean'
             AND is_superseded = 0
             AND (original_filename LIKE @q ESCAPE '\\' OR category LIKE @q ESCAPE '\\')
           ORDER BY uploaded_at DESC
        `);
      for (const row of dr.recordset) {
        hits.push({
          kind: 'Document',
          id: row.id,
          contractId,
          category: row.category,
          originalFilename: row.original_filename,
          uploadedAt: row.uploaded_at,
          snippet: row.original_filename,
        });
      }
    }

    if (wantChunks) {
      try {
        const embedder = new HashEmbeddingProvider(this.searchClient.embeddingDim);
        const [vec] = await embedder.embed([trimmed]);
        const req = vec !== undefined ? {
          contractId,
          query: trimmed,
          queryVector: vec,
          topK: 15,
          vectorWeight: 0.4,
        } : { contractId, query: trimmed, topK: 15 };
        const result = await this.searchClient.hybridQuery(req);
        for (const h of result.hits) {
          hits.push({
            kind: 'Chunk',
            chunkId: h.chunkId,
            contractId,
            sourceType: h.source.type,
            sourceId: h.source.id,
            text: h.text,
            score: h.score,
          });
        }
      } catch {
        // Search may not be reachable in some dev environments. Degrade
        // gracefully — keyword hits still returned.
      }
    }

    return { query: trimmed, hits, tookMs: Date.now() - t0 };
  }
}

function makeSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, 200);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 60);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
