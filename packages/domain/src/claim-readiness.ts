/**
 * Claim Readiness Score (SOW §3.35).
 *
 * Five-component live indicator per claim in draft showing how ready that
 * claim is for submission. A claim cannot be marked `Submitted` until the
 * score passes a minimum threshold OR the Commercial/Claims Lead explicitly
 * overrides with a logged justification (🔒 HUMAN GATE per review-gates.md).
 *
 * Each component scores red / amber / green with drill-down.
 */

export type ReadinessLight = 'red' | 'amber' | 'green';

export type ReadinessComponentId =
  | 'NoticeCompliance'
  | 'EvidenceCompleteness'
  | 'TimelineValidity'
  | 'ClauseSupport'
  | 'QuantumSubstantiation';

export interface ReadinessComponent {
  readonly id: ReadinessComponentId;
  readonly label: string;
  readonly light: ReadinessLight;
  readonly reason: string;
  readonly gaps: readonly string[];
}

export interface ClaimReadinessScore {
  readonly claimId: string;
  readonly overall: ReadinessLight;
  readonly passesSubmissionGate: boolean;
  readonly components: readonly ReadinessComponent[];
  readonly computedAt: Date;
}

/**
 * Submission gate: all components must be amber or green. Red on any
 * component blocks `Submitted` transition unless explicitly overridden.
 */
export function passesSubmissionGate(components: readonly ReadinessComponent[]): boolean {
  return components.every((c) => c.light !== 'red');
}

export function worstLight(components: readonly ReadinessComponent[]): ReadinessLight {
  if (components.some((c) => c.light === 'red')) return 'red';
  if (components.some((c) => c.light === 'amber')) return 'amber';
  return 'green';
}

export interface ReadinessInputs {
  readonly claimId: string;
  readonly hasNarrative: boolean;
  readonly hasPrimaryClause: boolean;
  readonly citedClauseCount: number;
  readonly citedEmailCount: number;
  readonly citedDocumentCount: number;
  readonly citedDiaryCount: number;
  readonly assertionCount: number;
  readonly assertionsWithLowConfidenceCount: number;
  readonly noticeDeadlinesTotal: number;
  readonly noticeDeadlinesMissed: number;
  readonly noticeDeadlinesVerified: number;
  readonly amountClaimedCents: number | null;
  readonly timeImpactDays: number | null;
  readonly quantumEvidenceCount: number;
}

export function computeReadinessComponents(
  inputs: ReadinessInputs,
): readonly ReadinessComponent[] {
  // Notice compliance — missed notices are claim-killers.
  const notice: ReadinessComponent = (() => {
    if (inputs.noticeDeadlinesMissed > 0) {
      return {
        id: 'NoticeCompliance',
        label: 'Notice compliance',
        light: 'red',
        reason: `${inputs.noticeDeadlinesMissed} required notice period missed`,
        gaps: [`${inputs.noticeDeadlinesMissed} missed notice(s) — refer to audit trail`],
      };
    }
    if (inputs.noticeDeadlinesTotal === 0) {
      return {
        id: 'NoticeCompliance',
        label: 'Notice compliance',
        light: 'amber',
        reason: 'No notice obligations tracked against this claim',
        gaps: ['Verify whether notice obligations apply and track them if so'],
      };
    }
    if (inputs.noticeDeadlinesVerified < inputs.noticeDeadlinesTotal) {
      return {
        id: 'NoticeCompliance',
        label: 'Notice compliance',
        light: 'amber',
        reason: `${inputs.noticeDeadlinesTotal - inputs.noticeDeadlinesVerified} notice obligation(s) unverified`,
        gaps: ['Verify all tracked notice obligations before submission'],
      };
    }
    return {
      id: 'NoticeCompliance',
      label: 'Notice compliance',
      light: 'green',
      reason: 'All notice obligations filed on time and verified',
      gaps: [],
    };
  })();

  // Evidence completeness
  const evidenceTotal =
    inputs.citedDocumentCount +
    inputs.citedEmailCount +
    inputs.citedDiaryCount +
    inputs.citedClauseCount;
  const evidence: ReadinessComponent = (() => {
    if (evidenceTotal === 0) {
      return {
        id: 'EvidenceCompleteness',
        label: 'Evidence completeness',
        light: 'red',
        reason: 'No cited evidence on this claim',
        gaps: ['Add cited documents, emails, diary entries, or clauses'],
      };
    }
    const gaps: string[] = [];
    if (inputs.citedDocumentCount === 0) gaps.push('No document evidence cited');
    if (inputs.citedEmailCount === 0) gaps.push('No email evidence cited');
    if (inputs.citedDiaryCount === 0) {
      gaps.push('No contemporaneous diary evidence cited (weakens evidentiary weight)');
    }
    if (gaps.length >= 2) {
      return {
        id: 'EvidenceCompleteness',
        label: 'Evidence completeness',
        light: 'amber',
        reason: `${gaps.length} evidence category missing`,
        gaps,
      };
    }
    return {
      id: 'EvidenceCompleteness',
      label: 'Evidence completeness',
      light: 'green',
      reason: `${evidenceTotal} cited evidence items across categories`,
      gaps,
    };
  })();

  // Timeline validity (approx — use assertion confidence as a proxy)
  const timeline: ReadinessComponent = (() => {
    if (inputs.assertionCount === 0) {
      return {
        id: 'TimelineValidity',
        label: 'Timeline validity',
        light: 'red',
        reason: 'No assertions drafted — timeline cannot be validated',
        gaps: ['Draft the chronology of events with per-event citations'],
      };
    }
    if (inputs.assertionsWithLowConfidenceCount > 0) {
      return {
        id: 'TimelineValidity',
        label: 'Timeline validity',
        light: 'amber',
        reason: `${inputs.assertionsWithLowConfidenceCount} low-confidence assertion(s)`,
        gaps: ['Re-examine low-confidence assertions; source stronger evidence or drop'],
      };
    }
    return {
      id: 'TimelineValidity',
      label: 'Timeline validity',
      light: 'green',
      reason: `${inputs.assertionCount} assertions all with non-low confidence`,
      gaps: [],
    };
  })();

  // Clause support
  const clauseSupport: ReadinessComponent = (() => {
    if (!inputs.hasPrimaryClause) {
      return {
        id: 'ClauseSupport',
        label: 'Clause support',
        light: 'red',
        reason: 'No primary contractual clause cited',
        gaps: ['Identify and cite the primary contractual clause basis of this claim'],
      };
    }
    if (inputs.citedClauseCount < 2) {
      return {
        id: 'ClauseSupport',
        label: 'Clause support',
        light: 'amber',
        reason: 'Only the primary clause is cited',
        gaps: ['Consider supporting clauses (definitions, notice, variations, damages caps)'],
      };
    }
    return {
      id: 'ClauseSupport',
      label: 'Clause support',
      light: 'green',
      reason: `${inputs.citedClauseCount} clauses cited including primary`,
      gaps: [],
    };
  })();

  // Quantum substantiation
  const quantum: ReadinessComponent = (() => {
    const hasFigures =
      inputs.amountClaimedCents !== null || inputs.timeImpactDays !== null;
    if (!hasFigures) {
      return {
        id: 'QuantumSubstantiation',
        label: 'Quantum substantiation',
        light: 'red',
        reason: 'No claimed amount or time-impact figures',
        gaps: ['Enter amountClaimedCents and/or timeImpactDays with supporting evidence'],
      };
    }
    if (inputs.quantumEvidenceCount === 0) {
      return {
        id: 'QuantumSubstantiation',
        label: 'Quantum substantiation',
        light: 'amber',
        reason: 'Figures entered but no cost/schedule evidence cited',
        gaps: ['Cite quotes, invoices, variation pricing, or schedule extracts'],
      };
    }
    return {
      id: 'QuantumSubstantiation',
      label: 'Quantum substantiation',
      light: 'green',
      reason: `Figures supported by ${inputs.quantumEvidenceCount} evidence items`,
      gaps: [],
    };
  })();

  return [notice, evidence, timeline, clauseSupport, quantum];
}

export function buildReadinessScore(inputs: ReadinessInputs): ClaimReadinessScore {
  const components = computeReadinessComponents(inputs);
  return {
    claimId: inputs.claimId,
    overall: worstLight(components),
    passesSubmissionGate: passesSubmissionGate(components),
    components,
    computedAt: new Date(),
  };
}
