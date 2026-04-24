import { describe, expect, it } from 'vitest';
import type { BidHandoffPayload } from './bid-handoff.js';

describe('bid handoff domain schema', () => {
  it('validates a minimal well-formed payload shape', () => {
    const payload: BidHandoffPayload = {
      bidId: 'BID-2026-0042',
      sourceSystem: 'BidIntake',
      winningProposal: {
        bidTitle: 'Red Lake Expansion — EPC',
        bidValueCents: 4_500_000_000,
        currency: 'CAD',
        submittedAt: '2026-03-01T12:00:00Z',
        winNoticeReceivedAt: '2026-03-15T17:00:00Z',
        scopeSummary: 'Turnkey EPC delivery.',
      },
      estimates: [],
      assumptions: [],
      qualifications: [],
      bidPhaseRisks: [
        {
          title: 'Weather risk',
          description: 'Winter shutdown window',
          category: 'Schedule',
          probability: 'Medium',
          impact: 'High',
          mitigation: 'Float contingency',
        },
      ],
      keyCorrespondence: [],
      contacts: [
        {
          name: 'A. PM',
          roleTitle: 'Project Manager',
          email: 'apm@client.example',
          phone: null,
          authorityLevel: 'CanApproveVariations',
          notes: null,
        },
      ],
    };
    expect(payload.bidPhaseRisks.length).toBe(1);
    expect(payload.bidPhaseRisks[0]?.probability).toBe('Medium');
    expect(payload.contacts[0]?.authorityLevel).toBe('CanApproveVariations');
  });
});
