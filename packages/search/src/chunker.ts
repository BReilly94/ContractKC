/**
 * Retrieval chunking (§5.3, data-model.md §5.2).
 *
 * Splits document text into overlapping chunks bounded by a token budget
 * (approximated in characters here — 4 chars ≈ 1 token).
 *
 * Each chunk carries back-references sufficient to resolve the citation
 * verifier's cited chunk id to a concrete anchor: document/email + page +
 * char offsets.
 */

export interface ChunkInput {
  readonly text: string;
  readonly maxChars?: number; // default 1800 chars ≈ 450 tokens
  readonly overlapChars?: number; // default 200
}

export interface TextChunk {
  readonly text: string;
  readonly charOffsetStart: number;
  readonly charOffsetEnd: number;
  readonly pageStart?: number;
  readonly pageEnd?: number;
}

export interface PagedInput extends ChunkInput {
  /** Optional page map: the character offset where each page (1-indexed) starts. */
  readonly pageOffsets?: readonly number[];
}

export function chunkText(input: PagedInput): readonly TextChunk[] {
  const { text } = input;
  const max = input.maxChars ?? 1800;
  const overlap = input.overlapChars ?? 200;
  const pageOffsets = input.pageOffsets;

  if (text.length === 0) return [];

  const chunks: TextChunk[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const end = Math.min(cursor + max, text.length);
    // Try to cut at a sentence boundary near the limit.
    let cut = end;
    if (end < text.length) {
      const windowStart = Math.max(end - 200, cursor + Math.floor(max / 3));
      const slice = text.slice(windowStart, end);
      // Match punctuation followed by whitespace; allow any next char
      // (matching on next=uppercase is too strict for short inputs).
      // Cut lands at the punctuation + 1 so the chunk ends ON the `.!?`.
      const match = slice.match(/[.!?]\s/g);
      if (match && match.length > 0) {
        const lastIdx = slice.lastIndexOf(match[match.length - 1]!);
        if (lastIdx >= 0) {
          cut = windowStart + lastIdx + 1;
        }
      }
    }
    const chunkText = text.slice(cursor, cut).trim();
    if (chunkText.length > 0) {
      const baseChunk: Omit<TextChunk, 'pageStart' | 'pageEnd'> = {
        text: chunkText,
        charOffsetStart: cursor,
        charOffsetEnd: cut,
      };
      if (pageOffsets) {
        chunks.push({
          ...baseChunk,
          pageStart: offsetToPage(cursor, pageOffsets),
          pageEnd: offsetToPage(cut, pageOffsets),
        });
      } else {
        chunks.push(baseChunk as TextChunk);
      }
    }
    if (cut >= text.length) break;
    cursor = Math.max(cut - overlap, cursor + 1);
  }
  return chunks;
}

function offsetToPage(offset: number, pageOffsets: readonly number[]): number {
  // pageOffsets[0] is start of page 1.
  let lo = 0;
  let hi = pageOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pageOffsets[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}
