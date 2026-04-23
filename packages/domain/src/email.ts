import type { BrandedId } from '@ckb/shared';
import type {
  ContractId,
  EmailAliasId,
  EmailReviewQueueItemId,
  EmailThreadId,
  SenderTrustEntryId,
  UserId,
} from './ids.js';

export type EmailId = BrandedId<'Email'>;

export type EmailAliasType = 'Canonical' | 'Human';

export interface EmailAlias {
  readonly id: EmailAliasId;
  readonly contractId: ContractId;
  readonly localPart: string;
  readonly canonicalAddress: string;
  readonly humanAlias: string | null;
  readonly aliasType: EmailAliasType;
  readonly active: boolean;
  readonly provisionedExternally: boolean;
  readonly createdAt: Date;
  readonly deactivatedAt: Date | null;
}

export const EMAIL_DOMAIN = 'contracts.technicamining.com';

export const RESERVED_LOCAL_PARTS: readonly string[] = [
  'postmaster',
  'abuse',
  'noreply',
  'admin',
  'root',
  'webmaster',
  'hostmaster',
];

const HUMAN_ALIAS_REGEX = /^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$/;

export function canonicalLocalPart(contractId: ContractId): string {
  return `contract-${contractId.toLowerCase()}`;
}

export function canonicalAddress(contractId: ContractId): string {
  return `${canonicalLocalPart(contractId)}@${EMAIL_DOMAIN}`;
}

export type HumanAliasValidation =
  | { valid: true }
  | { valid: false; reason: 'InvalidFormat' | 'Reserved' | 'CanonicalPrefix' };

export function validateHumanAlias(localPart: string): HumanAliasValidation {
  if (localPart.toLowerCase().startsWith('contract-'))
    return { valid: false, reason: 'CanonicalPrefix' };
  if (RESERVED_LOCAL_PARTS.includes(localPart.toLowerCase()))
    return { valid: false, reason: 'Reserved' };
  if (!HUMAN_ALIAS_REGEX.test(localPart)) return { valid: false, reason: 'InvalidFormat' };
  return { valid: true };
}

/* --------------------------------------------------------------------------
 * Email entity & siblings (§5.2 / data-model.md §4)
 * -------------------------------------------------------------------------- */

export type EmailDirection = 'Inbound' | 'Outbound';
export type SenderTrustState = 'Approved' | 'ReviewQueue' | 'Unapproved';
export type SharedLinkStatus =
  | 'NotApplicable'
  | 'AutoPullPending'
  | 'AutoPullComplete'
  | 'AutoPullFailed'
  | 'ManualCapturePending'
  | 'ManualCaptureComplete';

export interface Email {
  readonly id: EmailId;
  readonly contractId: ContractId;
  readonly rfcMessageId: string;
  readonly inReplyTo: string | null;
  readonly referencesRaw: string | null;
  readonly threadId: EmailThreadId | null;
  readonly direction: EmailDirection;
  readonly fromAddress: string;
  readonly fromName: string | null;
  readonly toAddresses: readonly string[];
  readonly ccAddresses: readonly string[];
  readonly bccAddresses: readonly string[];
  readonly subject: string;
  readonly sentAt: Date | null;
  readonly receivedAt: Date;
  readonly bodyText: string | null;
  readonly bodyHtmlBlobPath: string | null;
  readonly rawEmlSha256: string;
  readonly rawEmlBlobPath: string;
  readonly senderTrustState: SenderTrustState;
  readonly duplicateOfEmailId: EmailId | null;
  readonly privilegedFlag: boolean;
  readonly containsSharedLink: boolean;
  readonly sharedLinkStatus: SharedLinkStatus;
  readonly createdAt: Date;
}

export interface EmailThread {
  readonly id: EmailThreadId;
  readonly contractId: ContractId;
  readonly rootEmailId: EmailId | null;
  readonly subjectNormalized: string | null;
  readonly lastActivityAt: Date | null;
  readonly createdAt: Date;
}

export type SenderTrustMatchType = 'ExactAddress' | 'Domain';
export type SenderTrustEntryState = 'Approved' | 'Denied';

export interface SenderTrustEntry {
  readonly id: SenderTrustEntryId;
  readonly contractId: ContractId | null; // null = global
  readonly matchType: SenderTrustMatchType;
  readonly matchValue: string;
  readonly trustState: SenderTrustEntryState;
  readonly addedByUserId: UserId;
  readonly addedAt: Date;
  readonly reason: string | null;
}

export type ReviewQueueReason =
  | 'UnapprovedSender'
  | 'PasswordProtectedAttachment'
  | 'SharedLinkPending'
  | 'PrivilegedContent'
  | 'MalwareSuspect'
  | 'ManualReview';

export type ReviewQueueState = 'Pending' | 'Approved' | 'Rejected' | 'Actioned';

export interface EmailReviewQueueItem {
  readonly id: EmailReviewQueueItemId;
  readonly emailId: EmailId;
  readonly contractId: ContractId;
  readonly reason: ReviewQueueReason;
  readonly reasonDetail: string | null;
  readonly state: ReviewQueueState;
  readonly assignedToUserId: UserId | null;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: UserId | null;
  readonly resolutionNotes: string | null;
  readonly createdAt: Date;
}

/**
 * Normalized subject for thread matching (§5.2.5 fallback). Removes common
 * reply/forward prefixes and trailing ticket tags.
 */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();
  // Strip leading "Re:", "Fw:", "Fwd:", "[tag]" repeatedly.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const prev = s;
    s = s.replace(/^(re|fw|fwd)\s*:\s*/i, '');
    s = s.replace(/^\[[^\]]+\]\s*/, '');
    if (s === prev) break;
  }
  return s.trim().toLowerCase();
}

/**
 * Sender-trust resolution order (§5.2.7, email-ingestion.md §5.3):
 *   1. contract-scoped exact
 *   2. contract-scoped domain
 *   3. global exact
 *   4. global domain
 *   5. default → ReviewQueue
 */
export function resolveSenderTrust(
  fromAddress: string,
  entries: readonly SenderTrustEntry[],
  contractId: ContractId,
): SenderTrustState {
  const addr = fromAddress.toLowerCase();
  const domain = addr.includes('@') ? addr.split('@')[1]! : addr;

  const rank = (e: SenderTrustEntry): number => {
    const contractScoped = e.contractId === contractId ? 0 : 10;
    const typeWeight = e.matchType === 'ExactAddress' ? 0 : 1;
    return contractScoped + typeWeight;
  };

  const matches = entries
    .filter((e) => {
      if (e.contractId !== null && e.contractId !== contractId) return false;
      if (e.matchType === 'ExactAddress') return e.matchValue.toLowerCase() === addr;
      if (e.matchType === 'Domain') return e.matchValue.toLowerCase() === domain;
      return false;
    })
    .sort((a, b) => rank(a) - rank(b));

  if (matches.length === 0) return 'ReviewQueue';
  const best = matches[0]!;
  return best.trustState === 'Approved' ? 'Approved' : 'Unapproved';
}
