/**
 * Regression fixture set for the minutes-extract capability.
 */

export interface MinutesExtractRegressionCase {
  readonly id: string;
  readonly input: {
    readonly contractContext: string;
    readonly documentName: string;
    readonly documentText: string;
    readonly meetingDateHint: string | null;
  };
  readonly expectSubstrings?: readonly string[];
  readonly expectActionItemCountAtLeast?: number;
}

export const MINUTES_EXTRACT_REGRESSION_CASES: readonly MinutesExtractRegressionCase[] = [
  {
    id: 'minutes-extract-basic-01',
    input: {
      contractContext: 'Redlake Expansion',
      documentName: 'Weekly-Minutes-2026-04-10',
      meetingDateHint: '2026-04-10',
      documentText: [
        'Meeting date: 2026-04-10',
        'Attendees: PM, Superintendent, Consultant.',
        '',
        'Action items:',
        'Contractor to provide method statement for shotcreting by 2026-05-01.',
        'Consultant to respond to RFI-42 within 10 days of receipt.',
        'Discussion: Owner asks about schedule.',
      ].join('\n'),
    },
    expectSubstrings: ['Contractor', 'Consultant'],
    expectActionItemCountAtLeast: 2,
  },
  {
    id: 'minutes-extract-empty-01',
    input: {
      contractContext: 'Redlake Expansion',
      documentName: 'Safety-Briefing',
      meetingDateHint: null,
      documentText: 'Standard safety briefing. No action items recorded.',
    },
    expectActionItemCountAtLeast: 0,
  },
];
