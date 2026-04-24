import type { MockHandler } from '../../client/mock.js';
import type { ActionItemT, MinutesExtractOutputT } from './schema.js';

/**
 * Deterministic mock for minutes-extract.
 *
 * Extracts action items from lines that look like
 *   "Contractor to <verb> … by <date>"
 *   "<Party> to <verb> … within <N> days [of <trigger>]"
 * This is enough to exercise the pipeline end-to-end in CI without
 * spending real tokens.
 */
const PARTIES = ['Contractor', 'Client', 'Consultant'] as const;

const BY_DATE_RE = /^(Contractor|Client|Consultant)\s+to\s+(.+?)\s+by\s+(\d{4}-\d{2}-\d{2})\b/i;
const WITHIN_RE =
  /^(Contractor|Client|Consultant)\s+to\s+(.+?)\s+within\s+(\d{1,3})\s+(?:business\s+)?days?(?:\s+of\s+(.+))?/i;
const DATE_HEADER_RE = /^Meeting date:\s*(\d{4}-\d{2}-\d{2})/im;

export const minutesExtractMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const docMatch = user.match(/Minutes document:\s*(.+)/);
  const documentName = docMatch?.[1]?.trim() ?? 'minutes';
  const citation = `minutes:${documentName}`;

  const bodyMatch = user.match(/--- MINUTES TEXT ---\n([\s\S]*?)\n--- END ---/);
  const body = bodyMatch?.[1] ?? '';

  const dateHint = user.match(/Meeting date hint:\s*(\d{4}-\d{2}-\d{2})/);
  const dateHeader = body.match(DATE_HEADER_RE);
  const meetingDate = dateHint?.[1] ?? dateHeader?.[1] ?? null;

  const items: ActionItemT[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const byDate = line.match(BY_DATE_RE);
    if (byDate) {
      items.push({
        party: normalizeParty(byDate[1]!),
        commitment: byDate[2]!.trim(),
        dueDate: byDate[3]!,
        durationDays: null,
        triggerCondition: null,
        sourceClauseCitation: null,
        citation,
      });
      continue;
    }
    const within = line.match(WITHIN_RE);
    if (within) {
      items.push({
        party: normalizeParty(within[1]!),
        commitment: within[2]!.trim(),
        dueDate: null,
        durationDays: Number(within[3]),
        triggerCondition: within[4]?.trim() ?? 'Trigger per minutes',
        sourceClauseCitation: null,
        citation,
      });
    }
  }

  const output: MinutesExtractOutputT = {
    meetingDate,
    actionItems: items,
  };
  return JSON.stringify(output);
};

function normalizeParty(raw: string): ActionItemT['party'] {
  const lower = raw.toLowerCase();
  for (const p of PARTIES) {
    if (p.toLowerCase() === lower) return p;
  }
  return 'Other';
}
