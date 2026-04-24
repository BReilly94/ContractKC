import { describe, expect, it } from 'vitest';
import {
  LEGAL_SUBMITTAL_TRANSITIONS,
  isLegalSubmittalTransition,
  type SubmittalLifecycleState,
} from './submittal.js';

describe('submittal lifecycle FSM', () => {
  it('allows the happy path Draft → Submitted → UnderReview → Approved → Closed', () => {
    expect(isLegalSubmittalTransition('Draft', 'Submitted')).toBe(true);
    expect(isLegalSubmittalTransition('Submitted', 'UnderReview')).toBe(true);
    expect(isLegalSubmittalTransition('UnderReview', 'Approved')).toBe(true);
    expect(isLegalSubmittalTransition('Approved', 'Closed')).toBe(true);
  });

  it('allows every UnderReview outcome (Approved / ApprovedAsNoted / ReviseAndResubmit / Rejected)', () => {
    const outcomes: SubmittalLifecycleState[] = [
      'Approved',
      'ApprovedAsNoted',
      'ReviseAndResubmit',
      'Rejected',
    ];
    for (const outcome of outcomes) {
      expect(isLegalSubmittalTransition('UnderReview', outcome)).toBe(true);
      expect(isLegalSubmittalTransition(outcome, 'Closed')).toBe(true);
    }
  });

  it('allows early withdrawal from Draft or Submitted', () => {
    expect(isLegalSubmittalTransition('Draft', 'Closed')).toBe(true);
    expect(isLegalSubmittalTransition('Submitted', 'Closed')).toBe(true);
  });

  it('rejects skipping UnderReview (Submitted → Approved)', () => {
    expect(isLegalSubmittalTransition('Submitted', 'Approved')).toBe(false);
    expect(isLegalSubmittalTransition('Submitted', 'ApprovedAsNoted')).toBe(false);
    expect(isLegalSubmittalTransition('Submitted', 'Rejected')).toBe(false);
    expect(isLegalSubmittalTransition('Submitted', 'ReviseAndResubmit')).toBe(false);
  });

  it('rejects re-opening a closed submittal (resubmissions are new records, not state reverts)', () => {
    const targets: SubmittalLifecycleState[] = [
      'Draft', 'Submitted', 'UnderReview',
      'Approved', 'ApprovedAsNoted', 'ReviseAndResubmit', 'Rejected',
    ];
    for (const to of targets) {
      expect(isLegalSubmittalTransition('Closed', to)).toBe(false);
    }
  });

  it('rejects moving between review outcomes without passing through Closed', () => {
    expect(isLegalSubmittalTransition('ApprovedAsNoted', 'Approved')).toBe(false);
    expect(isLegalSubmittalTransition('Rejected', 'Approved')).toBe(false);
    expect(isLegalSubmittalTransition('ReviseAndResubmit', 'Approved')).toBe(false);
  });

  it('has no same-state self-loops in the transition table', () => {
    for (const t of LEGAL_SUBMITTAL_TRANSITIONS) {
      expect(t.from).not.toBe(t.to);
    }
  });
});
