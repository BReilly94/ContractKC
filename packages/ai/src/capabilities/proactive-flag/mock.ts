import type { MockHandler } from '../../client/mock.js';
import type {
  ProactiveFlagDeepReviewOutputT,
  ProactiveFlagFirstPassOutputT,
} from './schema.js';

/**
 * First-pass classifier mock. Looks for high-signal keywords in the
 * trigger summary + excerpt and either votes "candidate=true" with a
 * kind hint or passes the event straight through.
 */
export const proactiveFlagFirstPassMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const blob = user.toLowerCase();

  const rules: ReadonlyArray<{ re: RegExp; hint: ProactiveFlagFirstPassOutputT['flagKindHint'] }> = [
    { re: /\bnotice\b|\bclaim\b|\b14\.2\b/i, hint: 'PossibleNotice' },
    { re: /\bout of scope\b|\bnot in scope\b|\bextra work\b|\bsite instruction\b/i, hint: 'SuspectedScopeChange' },
    { re: /\bmilestone\b|\bdue in\b|\bdeadline\b/i, hint: 'DeadlineImminentNoPrep' },
    { re: /\brevision\b|\brev b\b|\brev c\b|\bventilation layout\b/i, hint: 'RevisionScopeImpact' },
  ];
  for (const r of rules) {
    if (r.re.test(blob)) {
      const output: ProactiveFlagFirstPassOutputT = {
        candidate: true,
        flagKindHint: r.hint,
        reasoning: `Trigger matched: ${r.re.source}`,
      };
      return JSON.stringify(output);
    }
  }
  const output: ProactiveFlagFirstPassOutputT = {
    candidate: false,
    flagKindHint: null,
    reasoning: 'No triage trigger matched',
  };
  return JSON.stringify(output);
};

/**
 * Deep-review mock. Always cites the first retrieved chunk; produces a
 * well-cited reasoning string so the citation verifier passes.
 */
export const proactiveFlagDeepReviewMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const chunkMatch = user.match(/\[chunkId:\s*([^\]]+)\]/);
  const chunkId = chunkMatch?.[1]?.trim();
  if (!chunkId) {
    const out: ProactiveFlagDeepReviewOutputT = {
      raise: false,
      flagKind: null,
      reasoning: 'Not flaggable.',
      recommendedAction: '',
      citedClauseIds: [],
      citedChunkIds: [],
    };
    return JSON.stringify(out);
  }

  const hintMatch = user.match(/First-pass hint:\s*(\S+)/);
  const hint = hintMatch?.[1];
  const allowed: ProactiveFlagDeepReviewOutputT['flagKind'] =
    hint === 'PossibleNotice' ||
    hint === 'SuspectedScopeChange' ||
    hint === 'DeadlineImminentNoPrep' ||
    hint === 'RevisionScopeImpact' ||
    hint === 'Other'
      ? hint
      : 'Other';

  const out: ProactiveFlagDeepReviewOutputT = {
    raise: true,
    flagKind: allowed,
    reasoning: `The retrieved clause is directly relevant to the triggering event. [cite:${chunkId}] Consider the recommended action. [cite:${chunkId}]`,
    recommendedAction: 'Review the cited clause and decide whether a response is required.',
    citedClauseIds: chunkId.startsWith('clause:') ? [chunkId] : [],
    citedChunkIds: [chunkId],
  };
  return JSON.stringify(out);
};
