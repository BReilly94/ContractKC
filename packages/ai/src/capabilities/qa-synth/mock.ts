import type { MockHandler } from '../../client/mock.js';

/**
 * Mock Q&A synthesizer.
 *
 * If any retrieved chunk mentions the question keyword, echo its text back
 * with citations. Otherwise emit the refusal phrasing.
 */
export const qaSynthMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const questionMatch = user.match(/Question:\s*([^\n]+)/);
  const question = (questionMatch?.[1] ?? '').toLowerCase();

  const chunkRe = /\[chunkId:\s*([^\]]+)\]\s*\(([^)]+)\)\n([\s\S]+?)(?=\n\n---\n\n|\nAnswer|$)/g;
  const chunks: Array<{ id: string; text: string }> = [];
  for (const m of user.matchAll(chunkRe)) {
    chunks.push({ id: m[1]!.trim(), text: m[3]!.trim() });
  }
  if (chunks.length === 0) {
    return 'The contract does not appear to address this question. [cite:none]';
  }
  // Keyword pick: first significant word from the question.
  const keywords = question.split(/\s+/).filter((w) => w.length > 3);
  const relevant = chunks.find((c) => keywords.some((k) => c.text.toLowerCase().includes(k)));
  if (!relevant) {
    return 'The contract does not appear to address this question. [cite:none]';
  }
  // Produce two citation-carrying sentences so the verifier sees coverage.
  return `Based on the retrieved text, the contract provides: ${relevant.text.slice(0, 160).replace(/\s+/g, ' ')}. [cite:${relevant.id}] This applies to the question as asked. [cite:${relevant.id}]`;
};
