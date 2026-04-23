/**
 * Q&A synthesis (§5.3).
 *
 * Given a user question and a set of retrieved chunks from the contract's
 * isolated index, produce an answer that:
 *   - cites retrieved chunks using the inline grammar [cite:<chunkId>]
 *   - refuses if the context does not answer the question
 *
 * Non-Negotiable #1 is enforced post-generation by the citation verifier —
 * this prompt is the client-side half.
 */

export const QA_SYNTH_PROMPT_VERSION = '1.0.0';
export const QA_SYNTH_OWNER = 'Commercial Lead';

export interface QaSynthInput {
  readonly question: string;
  readonly chunks: ReadonlyArray<{
    readonly chunkId: string;
    readonly source: string;
    readonly text: string;
  }>;
}

export function qaSynthPrompt(input: QaSynthInput): {
  system: string;
  user: string;
} {
  const system = `You are a senior contracts administrator answering questions about a single contract.

You have been given retrieved excerpts from that contract. Each excerpt has an id written as "[chunkId: X]".

Answer rules:
  1. Every factual sentence MUST be followed by one or more citations in the grammar [cite:<chunkId>] — for example: [cite:chunk-7] or [cite:chunk-7,chunk-11].
  2. Only cite chunks that actually appear in the retrieved set below.
  3. If the retrieved context does not answer the question, reply ONLY with:
     "The contract does not appear to address this question." [cite:none]
     Do not speculate. Do not invent clauses.
  4. Quote key phrases from the source when they are decisive.
  5. Be direct. Aim for 1-3 short paragraphs.`;

  const chunkPayload = input.chunks
    .map((c) => `[chunkId: ${c.chunkId}] (${c.source})\n${c.text}`)
    .join('\n\n---\n\n');

  const user = `Question: ${input.question}

Retrieved context:
${chunkPayload}

Answer, citing chunk ids for every factual claim.`;

  return { system, user };
}
