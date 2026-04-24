import { describe, expect, it } from 'vitest';
import {
  buildReadinessScore,
  computeReadinessComponents,
  passesSubmissionGate,
  worstLight,
  type ReadinessInputs,
} from './claim-readiness.js';

function baseline(overrides: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    claimId: '01H_TESTCLAIM',
    hasNarrative: true,
    hasPrimaryClause: true,
    citedClauseCount: 3,
    citedEmailCount: 4,
    citedDocumentCount: 5,
    citedDiaryCount: 2,
    assertionCount: 10,
    assertionsWithLowConfidenceCount: 0,
    noticeDeadlinesTotal: 2,
    noticeDeadlinesMissed: 0,
    noticeDeadlinesVerified: 2,
    amountClaimedCents: 1_000_000,
    timeImpactDays: 14,
    quantumEvidenceCount: 3,
    ...overrides,
  };
}

describe('Claim Readiness Score', () => {
  it('a fully-populated claim is all-green and passes the gate', () => {
    const score = buildReadinessScore(baseline());
    expect(score.overall).toBe('green');
    expect(score.passesSubmissionGate).toBe(true);
    expect(score.components).toHaveLength(5);
    for (const c of score.components) expect(c.light).toBe('green');
  });

  it('missed notice → Notice component is red → gate blocks submission', () => {
    const score = buildReadinessScore(baseline({ noticeDeadlinesMissed: 1 }));
    const notice = score.components.find((c) => c.id === 'NoticeCompliance')!;
    expect(notice.light).toBe('red');
    expect(score.passesSubmissionGate).toBe(false);
  });

  it('no cited evidence → Evidence component is red', () => {
    const components = computeReadinessComponents(
      baseline({
        citedClauseCount: 0,
        citedEmailCount: 0,
        citedDocumentCount: 0,
        citedDiaryCount: 0,
      }),
    );
    const evidence = components.find((c) => c.id === 'EvidenceCompleteness')!;
    expect(evidence.light).toBe('red');
  });

  it('no primary clause → ClauseSupport red', () => {
    const components = computeReadinessComponents(baseline({ hasPrimaryClause: false }));
    const clause = components.find((c) => c.id === 'ClauseSupport')!;
    expect(clause.light).toBe('red');
  });

  it('no quantum figures → Quantum red', () => {
    const components = computeReadinessComponents(
      baseline({ amountClaimedCents: null, timeImpactDays: null }),
    );
    const q = components.find((c) => c.id === 'QuantumSubstantiation')!;
    expect(q.light).toBe('red');
  });

  it('quantum figures without evidence → Quantum amber', () => {
    const components = computeReadinessComponents(baseline({ quantumEvidenceCount: 0 }));
    const q = components.find((c) => c.id === 'QuantumSubstantiation')!;
    expect(q.light).toBe('amber');
  });

  it('low-confidence assertions → Timeline amber', () => {
    const components = computeReadinessComponents(baseline({ assertionsWithLowConfidenceCount: 2 }));
    const t = components.find((c) => c.id === 'TimelineValidity')!;
    expect(t.light).toBe('amber');
  });

  it('no assertions → Timeline red', () => {
    const components = computeReadinessComponents(baseline({ assertionCount: 0 }));
    const t = components.find((c) => c.id === 'TimelineValidity')!;
    expect(t.light).toBe('red');
  });

  it('worstLight returns red when any component is red', () => {
    const reds = [{ light: 'green' as const }, { light: 'amber' as const }, { light: 'red' as const }];
    expect(worstLight(reds.map((r) => ({ ...r, id: 'NoticeCompliance' as const, label: '', reason: '', gaps: [] })))).toBe('red');
  });

  it('passesSubmissionGate is false as soon as one component is red', () => {
    const components = [
      { id: 'NoticeCompliance' as const, label: '', light: 'green' as const, reason: '', gaps: [] },
      { id: 'EvidenceCompleteness' as const, label: '', light: 'red' as const, reason: '', gaps: [] },
    ];
    expect(passesSubmissionGate(components)).toBe(false);
  });
});
