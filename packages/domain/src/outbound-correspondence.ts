import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Outbound correspondence (SOW §3.19, §6.16).
 *
 * Non-Negotiable #10: every outbound email is BCC'd to the project address
 * automatically — a system invariant, not a user setting.
 *
 * Enforced subject-line convention (§6.16): `[<contract-number>] <TYPE>-<SEQ>/R<REV> — <brief>`
 *   [redlake-expansion] RFI-17/R0 — Dewatering setback requirement
 *   [redlake-expansion] DelayNotice-3/R1 — Weather event March 4–9
 */

export type OutboundCorrespondenceId = BrandedId<'OutboundCorrespondence'>;
export type CorrespondenceTemplateId = BrandedId<'CorrespondenceTemplate'>;

export type CorrespondenceKind =
  | 'RFI'
  | 'DelayNotice'
  | 'VariationRequest'
  | 'ChangeOrderResponse'
  | 'NoticeOfDefault'
  | 'CureNotice'
  | 'GeneralCorrespondence'
  | 'ClaimSubmission'
  | 'InsuranceNotice'
  | 'CloseoutCorrespondence';

export type OutboundStatus = 'Draft' | 'Sending' | 'Sent' | 'Failed' | 'Recalled';

export interface CorrespondenceTemplate {
  readonly id: CorrespondenceTemplateId;
  readonly name: string;
  readonly kind: CorrespondenceKind;
  readonly version: number;
  readonly subjectPattern: string;
  readonly bodyText: string;
  readonly bodyHtml: string | null;
  readonly isActive: boolean;
  readonly ownerUserId: UserId;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OutboundCorrespondence {
  readonly id: OutboundCorrespondenceId;
  readonly contractId: ContractId;
  readonly correspondenceNumber: number;
  readonly kind: CorrespondenceKind;
  readonly revision: number;
  readonly templateId: CorrespondenceTemplateId | null;
  readonly templateVersion: number | null;
  readonly subject: string;
  readonly bodyText: string;
  readonly bodyHtml: string | null;
  readonly toAddresses: string[];
  readonly ccAddresses: string[];
  readonly bccAddresses: string[];
  readonly projectBccAddress: string;
  readonly status: OutboundStatus;
  readonly dkimMessageId: string | null;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly failureReason: string | null;
  readonly createdByUserId: UserId;
  readonly sentByUserId: UserId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SubjectLinePieces {
  readonly contractAlias: string;
  readonly kind: CorrespondenceKind;
  readonly sequence: number;
  readonly revision: number;
  readonly brief: string;
}

const SUBJECT_RE = /^\[(?<alias>[^\]]+)\]\s+(?<kind>[A-Za-z]+)-(?<seq>\d+)\/R(?<rev>\d+)\s+—\s+(?<brief>.+)$/;
const KINDS: readonly CorrespondenceKind[] = [
  'RFI','DelayNotice','VariationRequest','ChangeOrderResponse',
  'NoticeOfDefault','CureNotice','GeneralCorrespondence',
  'ClaimSubmission','InsuranceNotice','CloseoutCorrespondence',
];

export function formatSubjectLine(pieces: SubjectLinePieces): string {
  return `[${pieces.contractAlias}] ${pieces.kind}-${pieces.sequence}/R${pieces.revision} — ${pieces.brief}`;
}

export type SubjectParseResult =
  | { ok: true; pieces: SubjectLinePieces }
  | { ok: false; reason: string };

export function parseSubjectLine(subject: string): SubjectParseResult {
  const trimmed = subject.trim();
  const m = SUBJECT_RE.exec(trimmed);
  if (!m || !m.groups) {
    return {
      ok: false,
      reason: 'Subject line does not match required format: [contract-alias] TYPE-SEQ/RREV — brief',
    };
  }
  const kind = m.groups['kind'] as CorrespondenceKind;
  if (!KINDS.includes(kind)) {
    return { ok: false, reason: `Unknown correspondence kind: ${kind}` };
  }
  return {
    ok: true,
    pieces: {
      contractAlias: m.groups['alias']!,
      kind,
      sequence: Number(m.groups['seq']),
      revision: Number(m.groups['rev']),
      brief: m.groups['brief']!,
    },
  };
}

/**
 * NN #10: ensure `projectAddress` is in the bcc list — deduped, case-insensitive.
 */
export function ensureProjectBcc(
  bccAddresses: readonly string[],
  projectAddress: string,
): string[] {
  const normalized = projectAddress.toLowerCase().trim();
  const present = bccAddresses.some((a) => a.toLowerCase().trim() === normalized);
  if (present) return [...bccAddresses];
  return [...bccAddresses, projectAddress];
}
