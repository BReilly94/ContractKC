import { createHash } from 'node:crypto';

/**
 * Embedding provider abstraction. Phase 1 ships a deterministic hash-based
 * embedding for local dev + CI; Azure OpenAI / sentence-transformers slots
 * in behind this interface at cutover.
 *
 * ASSUMPTION: The hash-based embedding is non-semantic — it's good enough
 * to exercise the retrieval pipeline and confirm storage/search are wired,
 * but it will score BM25 >> vector on real queries. Replace before ship.
 * The regression harness currently passes only because queries have strong
 * keyword overlap with the source chunks; semantic regression queries lands
 * with the real embedder.
 */

export interface EmbeddingProvider {
  readonly dim: number;
  readonly mode: 'local' | 'azure';
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly mode: 'local' | 'azure' = 'local';

  constructor(readonly dim: number) {}

  async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): readonly number[] {
    // Deterministic pseudo-embedding: SHA-256 the text repeatedly and spread
    // the bytes across `dim` dimensions, then L2-normalize. Same text →
    // same vector; different text → different vector. Not semantic.
    const vec = new Float32Array(this.dim);
    let seed = Buffer.from(text, 'utf8');
    let idx = 0;
    while (idx < this.dim) {
      seed = createHash('sha256').update(seed).digest();
      for (let i = 0; i < seed.length && idx < this.dim; i += 1) {
        // Map byte (0-255) to (-1, 1).
        vec[idx] = (seed[i]! - 128) / 128;
        idx += 1;
      }
    }
    // L2 normalise.
    let norm = 0;
    for (let i = 0; i < this.dim; i += 1) norm += vec[i]! * vec[i]!;
    norm = Math.sqrt(norm) || 1;
    const out: number[] = new Array<number>(this.dim);
    for (let i = 0; i < this.dim; i += 1) out[i] = vec[i]! / norm;
    return out;
  }
}

export class AzureOpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly mode: 'local' | 'azure' = 'azure';
  readonly dim: number;
  constructor(dim: number) {
    this.dim = dim;
  }
  async embed(_texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    // ASSUMPTION: Azure OpenAI embeddings land at cutover. The shape of the
    // call is stable — just swap this impl. Fails closed to catch mis-wiring.
    throw new Error('Azure OpenAI embedding provider not yet implemented');
  }
}

export interface EmbeddingFactoryConfig {
  readonly mode: 'local' | 'azure';
  readonly dim: number;
}

export function createEmbeddingProvider(config: EmbeddingFactoryConfig): EmbeddingProvider {
  if (config.mode === 'local') return new HashEmbeddingProvider(config.dim);
  return new AzureOpenAiEmbeddingProvider(config.dim);
}
