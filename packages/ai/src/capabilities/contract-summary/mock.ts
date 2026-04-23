import type { MockHandler } from '../../client/mock.js';
import type { ContractSummaryOutputT } from './schema.js';

/**
 * Mock for contract-summary. Echos back a fully-cited synthetic summary that
 * references the first available chunk id from the prompt. Deterministic —
 * sufficient to exercise the pipeline without spend.
 */
export const contractSummaryMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const match = user.match(/\[chunkId:\s*([^\]]+)\]/);
  const chunk = match?.[1]?.trim() ?? 'chunk-unknown';

  const output: ContractSummaryOutputT = {
    parties: { client: 'Client (mock)', contractor: 'Technica Mining' },
    contractValue: { amount: 1_000_000, currency: 'CAD', citations: [chunk] },
    term: { startDate: '2026-04-01', endDate: '2027-03-31', citations: [chunk] },
    keyDates: [{ label: 'Mobilization', date: '2026-05-01', citation: chunk }],
    paymentTerms: {
      summary: 'Monthly progress claims net 30 days',
      citations: [chunk],
    },
    noticePeriods: [{ topic: 'Notice of claim', days: 14, citation: chunk }],
    liquidatedDamages: {
      summary: 'LDs apply at CAD 1,000/day capped at 10% of contract value',
      cap: '10% of contract value',
      citations: [chunk],
    },
    terminationTriggers: [{ trigger: 'Material breach uncured 30 days', citation: chunk }],
    governingLaw: { value: 'Ontario, Canada', citation: chunk },
    disputeResolution: { summary: 'Arbitration in Toronto under ICDR rules', citation: chunk },
    insuranceAndBonding: {
      summary: 'CGL CAD 5M, Professional CAD 2M, 50% performance bond',
      citations: [chunk],
    },
    flaggedClauses: [],
  };
  return JSON.stringify(output);
};
