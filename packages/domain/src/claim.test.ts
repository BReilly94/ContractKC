import { describe, expect, it } from 'vitest';
import {
  CLAIM_RESOLVED_STATES,
  LEGAL_CLAIM_TRANSITIONS,
  isClaimResolved,
  isLegalClaimTransition,
  type ClaimLifecycleState,
} from './claim.js';

describe('claim lifecycle FSM', () => {
  it('allows the full happy path Draft → InternalReview → Submitted → ClientResponseReceived → UnderNegotiation → ResolvedSettled', () => {
    expect(isLegalClaimTransition('Draft', 'InternalReview')).toBe(true);
    expect(isLegalClaimTransition('InternalReview', 'Submitted')).toBe(true);
    expect(isLegalClaimTransition('Submitted', 'ClientResponseReceived')).toBe(true);
    expect(isLegalClaimTransition('ClientResponseReceived', 'UnderNegotiation')).toBe(true);
    expect(isLegalClaimTransition('UnderNegotiation', 'ResolvedSettled')).toBe(true);
  });

  it('allows InternalReview → Draft (kick back for edits)', () => {
    expect(isLegalClaimTransition('InternalReview', 'Draft')).toBe(true);
  });

  it('allows early withdrawal from every pre-resolution state', () => {
    const preResolution: ClaimLifecycleState[] = [
      'Draft',
      'InternalReview',
      'Submitted',
      'ClientResponseReceived',
      'UnderNegotiation',
    ];
    for (const from of preResolution) {
      expect(isLegalClaimTransition(from, 'ResolvedWithdrawn')).toBe(true);
    }
  });

  it('allows direct resolution from ClientResponseReceived without negotiation', () => {
    expect(isLegalClaimTransition('ClientResponseReceived', 'ResolvedWon')).toBe(true);
    expect(isLegalClaimTransition('ClientResponseReceived', 'ResolvedLost')).toBe(true);
    expect(isLegalClaimTransition('ClientResponseReceived', 'ResolvedSettled')).toBe(true);
  });

  it('rejects skipping internal review (Draft → Submitted)', () => {
    expect(isLegalClaimTransition('Draft', 'Submitted')).toBe(false);
  });

  it('rejects re-opening a resolved claim', () => {
    for (const resolved of CLAIM_RESOLVED_STATES) {
      expect(isLegalClaimTransition(resolved, 'Draft')).toBe(false);
      expect(isLegalClaimTransition(resolved, 'InternalReview')).toBe(false);
      expect(isLegalClaimTransition(resolved, 'UnderNegotiation')).toBe(false);
    }
  });

  it('rejects resolving directly from Submitted as Won/Settled/Lost (requires client response first)', () => {
    expect(isLegalClaimTransition('Submitted', 'ResolvedWon')).toBe(false);
    expect(isLegalClaimTransition('Submitted', 'ResolvedSettled')).toBe(false);
    expect(isLegalClaimTransition('Submitted', 'ResolvedLost')).toBe(false);
  });

  it('has no same-state self-loops in the transition table', () => {
    for (const t of LEGAL_CLAIM_TRANSITIONS) {
      expect(t.from).not.toBe(t.to);
    }
  });
});

describe('isClaimResolved', () => {
  it('returns true for every Resolved* state', () => {
    for (const s of CLAIM_RESOLVED_STATES) {
      expect(isClaimResolved(s)).toBe(true);
    }
  });

  it('returns false for pre-resolution states', () => {
    expect(isClaimResolved('Draft')).toBe(false);
    expect(isClaimResolved('InternalReview')).toBe(false);
    expect(isClaimResolved('Submitted')).toBe(false);
    expect(isClaimResolved('ClientResponseReceived')).toBe(false);
    expect(isClaimResolved('UnderNegotiation')).toBe(false);
  });
});
