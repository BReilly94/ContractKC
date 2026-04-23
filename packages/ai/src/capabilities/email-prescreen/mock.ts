import type { MockHandler } from '../../client/mock.js';

/**
 * Mock handler for `email-prescreen`. Deterministic: if the body contains
 * any of the trigger words, returns Privileged. Otherwise None.
 *
 * This is enough to drive the regression harness without spending real
 * API budget during dev/CI.
 */

const TRIGGERS: ReadonlyArray<{ re: RegExp; category: 'Privileged' | 'HR' | 'CommercialSensitive' }> = [
  { re: /\bprivileged\b|\battorney[- ]client\b|\blitigation strategy\b/i, category: 'Privileged' },
  { re: /\bhr\b|\btermination\b|\bdiscipline\b|\bcompensation\b|\bpersonal medical\b/i, category: 'HR' },
  { re: /\bbid price\b|\bmargin\b|\bprice strategy\b|\btakeover\b/i, category: 'CommercialSensitive' },
];

export const emailPrescreenMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  for (const t of TRIGGERS) {
    if (t.re.test(user)) {
      return JSON.stringify({
        privileged: true,
        category: t.category,
        confidence: 'medium',
        reasoning: `Trigger matched: ${t.re.source}`,
      });
    }
  }
  return JSON.stringify({
    privileged: false,
    category: 'None',
    confidence: 'low',
    reasoning: 'No trigger matched',
  });
};
