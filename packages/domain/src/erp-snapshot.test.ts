import { describe, expect, it } from 'vitest';
import type { ErpSnapshot } from './erp-snapshot.js';

describe('erp snapshot domain shape', () => {
  it('accepts a scheduler-written snapshot with no last_refreshed_by_user_id', () => {
    const snap: ErpSnapshot = {
      id: '01HXERPSNAPSHOT000000000000' as ErpSnapshot['id'],
      contractId: '01HXCONTRACT0000000000000X' as ErpSnapshot['contractId'],
      takenAt: new Date('2026-04-23T10:00:00Z'),
      approvedContractValueCents: 4_500_000_000,
      approvedVariations: [
        { reference: 'VAR-001', title: 'Scope addition', approvedAmountCents: 250_000_00, approvedAt: '2026-03-20T10:00:00Z' },
      ],
      sourceSystem: 'SAP',
      lastRefreshedByUserId: null,
      lastRefreshedBySystem: 'scheduler',
      currency: 'CAD',
      notes: null,
    };
    expect(snap.approvedVariations.length).toBe(1);
    expect(snap.lastRefreshedBySystem).toBe('scheduler');
  });

  it('accepts a manual snapshot with a user principal and Manual source', () => {
    const snap: ErpSnapshot = {
      id: '01HXERPSNAPSHOT111111111111' as ErpSnapshot['id'],
      contractId: '01HXCONTRACT0000000000000Y' as ErpSnapshot['contractId'],
      takenAt: new Date(),
      approvedContractValueCents: 100_000_00,
      approvedVariations: [],
      sourceSystem: 'Manual',
      lastRefreshedByUserId: '01HXUSER00000000000000000A' as ErpSnapshot['lastRefreshedByUserId'],
      lastRefreshedBySystem: null,
      currency: 'CAD',
      notes: 'Entered by CL pending SAP wiring',
    };
    expect(snap.sourceSystem).toBe('Manual');
    expect(snap.lastRefreshedByUserId).not.toBeNull();
  });
});
