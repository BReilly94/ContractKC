import { describe, expect, it } from 'vitest';
import {
  LEGAL_VARIATION_TRANSITIONS,
  isLegalVariationTransition,
  type VariationLifecycleState,
} from './variation.js';

describe('variation lifecycle FSM', () => {
  it('allows the happy path Proposed → Priced → Submitted → Approved → Closed', () => {
    expect(isLegalVariationTransition('Proposed', 'Priced')).toBe(true);
    expect(isLegalVariationTransition('Priced', 'Submitted')).toBe(true);
    expect(isLegalVariationTransition('Submitted', 'Approved')).toBe(true);
    expect(isLegalVariationTransition('Approved', 'Closed')).toBe(true);
  });

  it('allows Submitted → Rejected → Closed', () => {
    expect(isLegalVariationTransition('Submitted', 'Rejected')).toBe(true);
    expect(isLegalVariationTransition('Rejected', 'Closed')).toBe(true);
  });

  it('allows Submitted → Disputed, then back to Approved, Rejected, or Closed', () => {
    expect(isLegalVariationTransition('Submitted', 'Disputed')).toBe(true);
    expect(isLegalVariationTransition('Disputed', 'Approved')).toBe(true);
    expect(isLegalVariationTransition('Disputed', 'Rejected')).toBe(true);
    expect(isLegalVariationTransition('Disputed', 'Closed')).toBe(true);
  });

  it('allows early withdrawal from Proposed or Priced', () => {
    expect(isLegalVariationTransition('Proposed', 'Closed')).toBe(true);
    expect(isLegalVariationTransition('Priced', 'Closed')).toBe(true);
  });

  it('rejects skipping pricing (Proposed → Submitted)', () => {
    expect(isLegalVariationTransition('Proposed', 'Submitted')).toBe(false);
  });

  it('rejects resurrecting a closed variation', () => {
    const targets: VariationLifecycleState[] = [
      'Proposed', 'Priced', 'Submitted', 'Approved', 'Rejected', 'Disputed',
    ];
    for (const to of targets) {
      expect(isLegalVariationTransition('Closed', to)).toBe(false);
    }
  });

  it('rejects Approved → Disputed (cannot re-open a decision that went the contractor\'s way)', () => {
    expect(isLegalVariationTransition('Approved', 'Disputed')).toBe(false);
  });

  it('rejects Rejected → Disputed (dispute must be raised at Submitted)', () => {
    expect(isLegalVariationTransition('Rejected', 'Disputed')).toBe(false);
  });

  it('has no same-state self-loops in the transition table', () => {
    for (const t of LEGAL_VARIATION_TRANSITIONS) {
      expect(t.from).not.toBe(t.to);
    }
  });
});
