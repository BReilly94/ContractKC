/**
 * Citation discipline (Non-Negotiable #1, `.claude/rules/ai-layer.md` §5).
 *
 * Every AI response shown to a user must carry citations tied to retrieved
 * chunks. This module provides:
 *  - the citation grammar every prompt template agrees to produce,
 *  - a parser that extracts citations from text,
 *  - a verifier that confirms each cited chunk exists in the retrieval
 *    result set and that no factual claim is uncited.
 *
 * Grammar: citations are inline, bracketed, and reference chunk IDs produced
 * by the retrieval layer: `[cite:<chunkId>]`. Multiple chunks per citation
 * are allowed: `[cite:a,b,c]`. The model may also emit `[cite:none]` when
 * declining due to insufficient context.
 */

export interface Citation {
  readonly chunkIds: readonly string[];
  readonly matchIndex: number;
  readonly matchLength: number;
}

const CITATION_REGEX = /\[cite:([a-zA-Z0-9,_\-]+)\]/g;

export function extractCitations(text: string): readonly Citation[] {
  const citations: Citation[] = [];
  for (const m of text.matchAll(CITATION_REGEX)) {
    const rawIds = m[1] ?? '';
    const chunkIds = rawIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    citations.push({
      chunkIds,
      matchIndex: m.index ?? 0,
      matchLength: m[0].length,
    });
  }
  return citations;
}

export interface VerifyInput {
  readonly responseText: string;
  readonly retrievedChunkIds: readonly string[];
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly citations: readonly Citation[];
  readonly unknownChunkIds: readonly string[];
  readonly uncitedSentenceCount: number;
  readonly reason?: string;
}

/**
 * A response passes verification if:
 *   1. Every `[cite:...]` references at least one chunk in `retrievedChunkIds`.
 *   2. Every sentence outside of explicit refusal carries at least one citation.
 *
 * Refusal is detected by either:
 *   - a single `[cite:none]` in the response, or
 *   - a sentence beginning with the refusal preamble defined below.
 *
 * The goal is not NLP perfection — it's a fail-closed safety net. False
 * positives here mean "the model should have cited more"; false negatives
 * (missed uncited claims) are the dangerous direction, so we err strict.
 */
const REFUSAL_PREFIXES = [
  'the contract does not appear',
  'the provided context does not',
  'insufficient context',
  'i cannot answer',
];

export function verifyCitations(input: VerifyInput): VerifyResult {
  const citations = extractCitations(input.responseText);
  const known = new Set(input.retrievedChunkIds);

  // Explicit refusal marker.
  if (
    citations.length === 1 &&
    citations[0]!.chunkIds.length === 1 &&
    citations[0]!.chunkIds[0] === 'none'
  ) {
    return { ok: true, citations, unknownChunkIds: [], uncitedSentenceCount: 0 };
  }

  const unknown: string[] = [];
  for (const c of citations) {
    for (const id of c.chunkIds) {
      if (id === 'none') continue;
      if (!known.has(id)) unknown.push(id);
    }
  }
  if (unknown.length > 0) {
    return {
      ok: false,
      citations,
      unknownChunkIds: unknown,
      uncitedSentenceCount: 0,
      reason: 'Response cites chunks that were not in the retrieval result set',
    };
  }

  // Sentence-level citation coverage. Split on sentence boundaries in a
  // forgiving way: `.`, `!`, or `?` followed by whitespace or end-of-string.
  const stripped = input.responseText.replace(CITATION_REGEX, ' ').trim();
  if (stripped.length === 0) {
    // Response is only citations; pass.
    return { ok: true, citations, unknownChunkIds: [], uncitedSentenceCount: 0 };
  }
  const sentences = splitSentences(input.responseText);
  let uncited = 0;
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length === 0) continue;
    const lower = trimmed.toLowerCase();
    if (REFUSAL_PREFIXES.some((p) => lower.startsWith(p))) continue;
    if (!CITATION_REGEX.test(trimmed)) {
      // Reset lastIndex because we reuse the regex below.
      CITATION_REGEX.lastIndex = 0;
      uncited += 1;
    } else {
      CITATION_REGEX.lastIndex = 0;
    }
  }
  if (uncited > 0) {
    return {
      ok: false,
      citations,
      unknownChunkIds: [],
      uncitedSentenceCount: uncited,
      reason: `${uncited} sentence(s) missing citation`,
    };
  }
  return { ok: true, citations, unknownChunkIds: [], uncitedSentenceCount: 0 };
}

export function splitSentences(text: string): readonly string[] {
  // Keep it simple — the verifier is stricter than we need; over-splitting
  // is safer than under-splitting.
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
