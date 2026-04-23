import type { MockHandler } from '../../client/mock.js';

/**
 * Mock for clause-extract. Simple heuristic scan for numbered headings like
 * "14.2" followed by a heading and a paragraph; builds one clause per match.
 * Sufficient to exercise the pipeline without spend.
 */
export const clauseExtractMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const bodyMatch = user.match(/"""\s*([\s\S]+?)\s*"""/);
  const body = bodyMatch?.[1] ?? '';
  const pattern = /^\s*(\d+(?:\.\d+)*(?:\([a-z]\))?)\s+([A-Z][^\n]{0,80})\n+([\s\S]+?)(?=\n\s*\d+(?:\.\d+)*(?:\([a-z]\))?\s+[A-Z]|\s*$)/gm;
  const clauses: Array<{
    clauseNumber: string;
    heading: string;
    text: string;
    clauseType: string;
    confidence: string;
  }> = [];
  for (const m of body.matchAll(pattern)) {
    clauses.push({
      clauseNumber: m[1]!,
      heading: m[2]!.trim(),
      text: m[3]!.trim(),
      clauseType: guessType(m[2]!),
      confidence: 'medium',
    });
  }
  return JSON.stringify({ clauses });
};

function guessType(heading: string): string {
  const h = heading.toLowerCase();
  if (/notice/.test(h)) return 'NoticeProvision';
  if (/payment/.test(h)) return 'Payment';
  if (/variation|change/.test(h)) return 'Variation';
  if (/terminat/.test(h)) return 'Termination';
  if (/liquidated/.test(h)) return 'LiquidatedDamages';
  if (/dispute|arbitrat/.test(h)) return 'DisputeResolution';
  if (/indemn/.test(h)) return 'Indemnity';
  if (/insurance/.test(h)) return 'Insurance';
  if (/governing/.test(h)) return 'GoverningLaw';
  return 'Other';
}
