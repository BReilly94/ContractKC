import type {
  ContractAccessId,
  ContractAccessRevocationId,
  ContractId,
  UserId,
} from './ids.js';

export type ContractRole =
  | 'Owner'
  | 'Administrator'
  | 'Contributor'
  | 'Viewer'
  | 'RestrictedViewer';

export interface ContractAccess {
  readonly id: ContractAccessId;
  readonly contractId: ContractId;
  readonly userId: UserId;
  readonly contractRole: ContractRole;
  readonly grantedByUserId: UserId;
  readonly grantedAt: Date;
}

export type RevocationReason =
  | 'ConflictOfInterest'
  | 'RoleChange'
  | 'LegalInstruction'
  | 'EthicalWall'
  | 'Other';

export interface ContractAccessRevocation {
  readonly id: ContractAccessRevocationId;
  readonly contractId: ContractId;
  readonly userId: UserId;
  readonly revokedByUserId: UserId;
  readonly revokedAt: Date;
  readonly reasonCategory: RevocationReason;
  readonly reasonNote: string | null;
  readonly reversedAt: Date | null;
  readonly reversedByUserId: UserId | null;
}

export type AccessDecision =
  | { allow: true; role: ContractRole }
  | { allow: false; reason: 'Revoked' | 'NoGrant' };

export function decideAccess(params: {
  revocations: readonly Pick<ContractAccessRevocation, 'userId' | 'reversedAt'>[];
  grants: readonly Pick<ContractAccess, 'userId' | 'contractRole'>[];
  subjectUserId: UserId;
}): AccessDecision {
  const activeRevocation = params.revocations.find(
    (r) => r.userId === params.subjectUserId && r.reversedAt === null,
  );
  if (activeRevocation) {
    return { allow: false, reason: 'Revoked' };
  }
  const grant = params.grants.find((g) => g.userId === params.subjectUserId);
  if (grant) {
    return { allow: true, role: grant.contractRole };
  }
  return { allow: false, reason: 'NoGrant' };
}
