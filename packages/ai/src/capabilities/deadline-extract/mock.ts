import type { MockHandler } from '../../client/mock.js';

/**
 * Mock for deadline-extract. Returns a single obligation tied to the first
 * chunk id if the body contains typical trigger language; otherwise empty.
 */
const WITHIN_RE = /within\s+(\d{1,3})\s+(?:business\s+)?days?\b/i;
const NOTICE_RE = /\bnotice\b/i;

export const deadlineExtractMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const chunkMatch = user.match(/\[chunkId:\s*([^\]]+)\]/);
  const chunkId = chunkMatch?.[1]?.trim() ?? 'chunk-unknown';

  const dayMatch = user.match(WITHIN_RE);
  if (!dayMatch || !NOTICE_RE.test(user)) {
    return JSON.stringify({ obligations: [] });
  }
  const days = Number(dayMatch[1]);
  return JSON.stringify({
    obligations: [
      {
        label: 'Notice obligation (mock extracted)',
        responsibleParty: 'Contractor',
        triggerCondition: 'on becoming aware',
        durationDays: days,
        absoluteDate: null,
        alertLeadDays: Math.max(1, Math.min(3, Math.floor(days / 4))),
        consequence: 'As stated in cited clause',
        citation: chunkId,
      },
    ],
  });
};
