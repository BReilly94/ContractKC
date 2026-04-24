/**
 * Regression fixture set for proactive-flag (both first-pass and deep-review).
 */

export interface ProactiveFlagFirstPassRegressionCase {
  readonly id: string;
  readonly phase: 'first-pass';
  readonly input: {
    readonly contractContext: string;
    readonly triggerEventType: 'Email' | 'Document' | 'SiteDiaryEntry' | 'DrawingRevision';
    readonly triggerSummary: string;
    readonly triggerExcerpt: string;
    readonly sensitivity: 'Conservative' | 'Standard' | 'Aggressive';
  };
  readonly expectCandidate: boolean;
}

export interface ProactiveFlagDeepReviewRegressionCase {
  readonly id: string;
  readonly phase: 'deep-review';
  readonly input: {
    readonly contractContext: string;
    readonly triggerEventType: 'Email' | 'Document' | 'SiteDiaryEntry' | 'DrawingRevision';
    readonly triggerSummary: string;
    readonly triggerExcerpt: string;
    readonly flagKindHint: string | null;
    readonly chunks: ReadonlyArray<{
      readonly chunkId: string;
      readonly source: string;
      readonly text: string;
    }>;
  };
  readonly expectRaise: boolean;
  readonly expectCitations?: readonly string[];
}

export const PROACTIVE_FLAG_REGRESSION_CASES: ReadonlyArray<
  ProactiveFlagFirstPassRegressionCase | ProactiveFlagDeepReviewRegressionCase
> = [
  {
    id: 'proactive-flag-first-pass-notice-01',
    phase: 'first-pass',
    input: {
      contractContext: 'Redlake Expansion',
      triggerEventType: 'Email',
      triggerSummary: 'Client email referencing Clause 14.2',
      triggerExcerpt: 'Please note that we consider this email to be notice under Clause 14.2.',
      sensitivity: 'Standard',
    },
    expectCandidate: true,
  },
  {
    id: 'proactive-flag-first-pass-plain-01',
    phase: 'first-pass',
    input: {
      contractContext: 'Redlake Expansion',
      triggerEventType: 'Email',
      triggerSummary: 'Scheduling confirmation',
      triggerExcerpt: 'Confirming tomorrow 9am walk-through.',
      sensitivity: 'Standard',
    },
    expectCandidate: false,
  },
  {
    id: 'proactive-flag-deep-review-notice-01',
    phase: 'deep-review',
    input: {
      contractContext: 'Redlake Expansion',
      triggerEventType: 'Email',
      triggerSummary: 'Client email referencing Clause 14.2',
      triggerExcerpt: 'We regard this as notice under Clause 14.2.',
      flagKindHint: 'PossibleNotice',
      chunks: [
        {
          chunkId: 'chunk-ntc-01',
          source: 'Master Agreement §14.2',
          text: 'The Contractor shall give written notice of any claim within 14 days of becoming aware of the event giving rise thereto.',
        },
      ],
    },
    expectRaise: true,
    expectCitations: ['chunk-ntc-01'],
  },
];
