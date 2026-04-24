import { describe, expect, it } from 'vitest';
import { evaluateCloseoutArchiveGate } from './closeout.js';

describe('evaluateCloseoutArchiveGate', () => {
  it('blocks when no checklist has been generated', () => {
    expect(
      evaluateCloseoutArchiveGate({
        hasChecklist: false,
        pendingCount: 0,
        certificateGenerated: false,
        requireCertificate: false,
      }),
    ).toEqual({ code: 'NoChecklist' });
  });

  it('blocks when any item is still Pending', () => {
    expect(
      evaluateCloseoutArchiveGate({
        hasChecklist: true,
        pendingCount: 2,
        certificateGenerated: true,
        requireCertificate: false,
      }),
    ).toEqual({ code: 'ItemsOutstanding', pendingCount: 2 });
  });

  it('blocks when certificate is required but not generated', () => {
    expect(
      evaluateCloseoutArchiveGate({
        hasChecklist: true,
        pendingCount: 0,
        certificateGenerated: false,
        requireCertificate: true,
      }),
    ).toEqual({ code: 'CertificateMissing' });
  });

  it('allows when every item is Signed/Waived and certificate requirement is met', () => {
    expect(
      evaluateCloseoutArchiveGate({
        hasChecklist: true,
        pendingCount: 0,
        certificateGenerated: true,
        requireCertificate: true,
      }),
    ).toBeNull();
    expect(
      evaluateCloseoutArchiveGate({
        hasChecklist: true,
        pendingCount: 0,
        certificateGenerated: false,
        requireCertificate: false,
      }),
    ).toBeNull();
  });
});
