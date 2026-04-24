/**
 * Regression test fixture set for drawing-diff.
 *
 * The full regression harness is driven by `packages/ai/src/regression/`;
 * this file exposes the canonical in-package query set so the
 * capability can evolve its own examples alongside the prompt.
 */

export interface DrawingDiffRegressionCase {
  readonly id: string;
  readonly input: {
    readonly contractContext: string;
    readonly documentName: string;
    readonly priorVersionLabel: string;
    readonly newVersionLabel: string;
    readonly priorText: string;
    readonly newText: string;
  };
  readonly expectScopeImpact: 'None' | 'Minor' | 'Suspected' | 'Major';
  readonly expectSubstrings?: readonly string[];
}

export const DRAWING_DIFF_REGRESSION_CASES: readonly DrawingDiffRegressionCase[] = [
  {
    id: 'drawing-diff-identical-01',
    input: {
      contractContext: 'Redlake Expansion',
      documentName: 'M-101 Ventilation Layout',
      priorVersionLabel: 'Rev A',
      newVersionLabel: 'Rev B',
      priorText: 'Drawing M-101. Level 1 layout. Grid A-F. Gate 1.',
      newText: 'Drawing M-101. Level 1 layout. Grid A-F. Gate 1.',
    },
    expectScopeImpact: 'None',
  },
  {
    id: 'drawing-diff-ventilation-added-01',
    input: {
      contractContext: 'Redlake Expansion',
      documentName: 'M-101 Ventilation Layout',
      priorVersionLabel: 'Rev A',
      newVersionLabel: 'Rev B',
      priorText: 'Drawing M-101. Level 1 layout.',
      newText:
        'Drawing M-101. Level 1 layout. Ventilation raise relocated from Grid C to Grid D. New 1200mm duct run added.',
    },
    expectScopeImpact: 'Major',
    expectSubstrings: ['Ventilation'],
  },
];
