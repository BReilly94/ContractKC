import { describe, expect, it } from 'vitest';
import { evaluateTransitionGate, isLegalTransition } from './contract.js';

describe('contract lifecycle FSM', () => {
  it('allows Draft → Onboarding', () => {
    expect(isLegalTransition('Draft', 'Onboarding')).toBe(true);
  });

  it('allows Onboarding → Active', () => {
    expect(isLegalTransition('Onboarding', 'Active')).toBe(true);
  });

  it('allows Active ↔ IssueInProgress', () => {
    expect(isLegalTransition('Active', 'IssueInProgress')).toBe(true);
    expect(isLegalTransition('IssueInProgress', 'Active')).toBe(true);
  });

  it('allows Closeout → Archived', () => {
    expect(isLegalTransition('Closeout', 'Archived')).toBe(true);
  });

  it('rejects Draft → Active (must go through Onboarding)', () => {
    expect(isLegalTransition('Draft', 'Active')).toBe(false);
  });

  it('rejects Archived → anything', () => {
    expect(isLegalTransition('Archived', 'Active')).toBe(false);
    expect(isLegalTransition('Archived', 'Draft')).toBe(false);
  });

  it('rejects Active → Draft', () => {
    expect(isLegalTransition('Active', 'Draft')).toBe(false);
  });
});

describe('evaluateTransitionGate', () => {
  it('passes legal transitions when summary is verified', () => {
    const gate = evaluateTransitionGate({
      from: 'Onboarding',
      to: 'Active',
      summaryVerificationState: 'Verified',
    });
    expect(gate).toBeNull();
  });

  it('blocks Onboarding → Active when summary is Unverified (Non-Negotiable #2)', () => {
    const gate = evaluateTransitionGate({
      from: 'Onboarding',
      to: 'Active',
      summaryVerificationState: 'Unverified',
    });
    expect(gate).toEqual({
      code: 'SummaryUnverified',
      from: 'Onboarding',
      to: 'Active',
    });
  });

  it('blocks Onboarding → Active when summary is Superseded', () => {
    const gate = evaluateTransitionGate({
      from: 'Onboarding',
      to: 'Active',
      summaryVerificationState: 'Superseded',
    });
    expect(gate?.code).toBe('SummaryUnverified');
  });

  it('blocks illegal transitions regardless of summary state', () => {
    const gate = evaluateTransitionGate({
      from: 'Draft',
      to: 'Active',
      summaryVerificationState: 'Verified',
    });
    expect(gate?.code).toBe('IllegalTransition');
  });
});
