import { describe, expect, it } from 'vitest';
import {
  LEGAL_RFI_TRANSITIONS,
  isLegalRfiTransition,
  type RfiLifecycleState,
} from './rfi.js';

describe('rfi lifecycle FSM', () => {
  it('allows the happy path Draft → Issued → AwaitingResponse → ResponseReceived → Closed', () => {
    expect(isLegalRfiTransition('Draft', 'Issued')).toBe(true);
    expect(isLegalRfiTransition('Issued', 'AwaitingResponse')).toBe(true);
    expect(isLegalRfiTransition('AwaitingResponse', 'ResponseReceived')).toBe(true);
    expect(isLegalRfiTransition('ResponseReceived', 'Closed')).toBe(true);
  });

  it('allows follow-up exchanges (ResponseReceived → AwaitingResponse)', () => {
    expect(isLegalRfiTransition('ResponseReceived', 'AwaitingResponse')).toBe(true);
  });

  it('allows closing without a response from several states', () => {
    expect(isLegalRfiTransition('Draft', 'Closed')).toBe(true);
    expect(isLegalRfiTransition('Issued', 'Closed')).toBe(true);
    expect(isLegalRfiTransition('AwaitingResponse', 'Closed')).toBe(true);
  });

  it('rejects skipping Issued (Draft → AwaitingResponse)', () => {
    expect(isLegalRfiTransition('Draft', 'AwaitingResponse')).toBe(false);
  });

  it('rejects re-opening a closed RFI', () => {
    const targets: RfiLifecycleState[] = ['Draft', 'Issued', 'AwaitingResponse', 'ResponseReceived'];
    for (const to of targets) {
      expect(isLegalRfiTransition('Closed', to)).toBe(false);
    }
  });

  it('rejects reverting Issued → Draft', () => {
    expect(isLegalRfiTransition('Issued', 'Draft')).toBe(false);
  });

  it('has no same-state self-loops in the transition table', () => {
    for (const t of LEGAL_RFI_TRANSITIONS) {
      expect(t.from).not.toBe(t.to);
    }
  });
});
