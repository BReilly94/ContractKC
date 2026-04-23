import type { User, UserId } from '@ckb/domain';

export interface Principal {
  readonly userId: UserId;
  readonly user: User;
}

export interface AuthProvider {
  readonly mode: 'local-dev' | 'entra';
  verifyToken(token: string): Promise<Principal | null>;
  issueDevToken(userId: UserId): Promise<string>;
  listDevUsers(): Promise<User[]>;
}
