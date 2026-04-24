import { describe, expect, it } from 'vitest';
import {
  LEGAL_PROACTIVE_FLAG_TRANSITIONS,
  isLegalProactiveFlagTransition,
  type ProactiveFlagStatus,
} from './proactive-flag.js';
import { severityForScopeImpact } from './drawing-diff.js';

describe('proactive-flag FSM', () => {
  it('permits New → Actioned/Dismissed/Escalated', () => {
    expect(isLegalProactiveFlagTransition('New', 'Actioned')).toBe(true);
    expect(isLegalProactiveFlagTransition('New', 'Dismissed')).toBe(true);
    expect(isLegalProactiveFlagTransition('New', 'Escalated')).toBe(true);
  });

  it('permits Escalated → Actioned/Dismissed', () => {
    expect(isLegalProactiveFlagTransition('Escalated', 'Actioned')).toBe(true);
    expect(isLegalProactiveFlagTransition('Escalated', 'Dismissed')).toBe(true);
  });

  it('refuses resurrection of terminal states', () => {
    expect(isLegalProactiveFlagTransition('Actioned', 'New')).toBe(false);
    expect(isLegalProactiveFlagTransition('Dismissed', 'New')).toBe(false);
    expect(isLegalProactiveFlagTransition('Actioned', 'Escalated')).toBe(false);
    expect(isLegalProactiveFlagTransition('Dismissed', 'Escalated')).toBe(false);
  });

  it('refuses self-transitions', () => {
    const states: ProactiveFlagStatus[] = ['New', 'Actioned', 'Dismissed', 'Escalated'];
    for (const s of states) {
      expect(isLegalProactiveFlagTransition(s, s)).toBe(false);
    }
  });

  it('has no duplicate transitions', () => {
    const keys = LEGAL_PROACTIVE_FLAG_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('drawing-diff severityForScopeImpact', () => {
  it('maps scope impact levels onto record_flag severity levels', () => {
    expect(severityForScopeImpact('None')).toBeNull();
    expect(severityForScopeImpact('Minor')).toBe('Low');
    expect(severityForScopeImpact('Suspected')).toBe('Medium');
    expect(severityForScopeImpact('Major')).toBe('High');
  });
});
