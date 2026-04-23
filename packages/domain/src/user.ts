import type { UserId } from './ids.js';

export type GlobalRole =
  | 'SystemAdministrator'
  | 'KnowledgeCentreAdministrator'
  | 'Auditor'
  | 'Standard';

export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string;
  readonly globalRole: GlobalRole;
  readonly isPm: boolean;
  readonly canCreateContracts: boolean;
  readonly createdAt: Date;
}
