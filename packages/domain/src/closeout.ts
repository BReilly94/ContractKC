import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Project Closeout Checklist (SOW §3.23, §6.21, §8.11).
 *
 * Each contract gets a checklist instantiated from a `CloseoutTemplate`
 * (EPC / Construction / Supply / Services). Every item moves through
 * Pending → Signed or Pending → Waived.
 *
 * 🔒 HUMAN GATE: a Contract cannot transition Closeout → Archived until
 * every item is either Signed or Waived (§6.21, Non-Negotiable #2 adjacent).
 */

export type CloseoutTemplateId = BrandedId<'CloseoutTemplate'>;
export type CloseoutChecklistId = BrandedId<'CloseoutChecklist'>;
export type CloseoutChecklistItemId = BrandedId<'CloseoutChecklistItem'>;

export type CloseoutTemplateKind = 'EPC' | 'Construction' | 'Supply' | 'Services';

export type CloseoutItemStatus = 'Pending' | 'Signed' | 'Waived';

export interface CloseoutTemplateItem {
  readonly itemKey: string;
  readonly title: string;
  readonly description: string | null;
}

export interface CloseoutTemplate {
  readonly id: CloseoutTemplateId;
  readonly kind: CloseoutTemplateKind;
  readonly name: string;
  readonly items: readonly CloseoutTemplateItem[];
  readonly createdByUserId: UserId | null;
  readonly createdAt: Date;
}

export interface CloseoutChecklist {
  readonly id: CloseoutChecklistId;
  readonly contractId: ContractId;
  readonly templateId: CloseoutTemplateId;
  readonly generatedCertificateBlobPath: string | null;
  readonly certificateGeneratedAt: Date | null;
  readonly certificateGeneratedByUserId: UserId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CloseoutChecklistItem {
  readonly id: CloseoutChecklistItemId;
  readonly checklistId: CloseoutChecklistId;
  readonly itemKey: string;
  readonly title: string;
  readonly description: string | null;
  readonly ownerUserId: UserId | null;
  readonly status: CloseoutItemStatus;
  readonly signedAt: Date | null;
  readonly signedByUserId: UserId | null;
  readonly waiveReason: string | null;
  readonly waivedAt: Date | null;
  readonly waivedByUserId: UserId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Archive gate (§6.21): every item must be Signed or Waived. Returns a
 * structured reason if the gate fails so services can surface it to callers.
 */
export type CloseoutArchiveGateFailure =
  | { code: 'NoChecklist' }
  | { code: 'ItemsOutstanding'; pendingCount: number }
  | { code: 'CertificateMissing' };

export function evaluateCloseoutArchiveGate(params: {
  readonly hasChecklist: boolean;
  readonly pendingCount: number;
  readonly certificateGenerated: boolean;
  readonly requireCertificate: boolean;
}): CloseoutArchiveGateFailure | null {
  if (!params.hasChecklist) return { code: 'NoChecklist' };
  if (params.pendingCount > 0) {
    return { code: 'ItemsOutstanding', pendingCount: params.pendingCount };
  }
  if (params.requireCertificate && !params.certificateGenerated) {
    return { code: 'CertificateMissing' };
  }
  return null;
}
