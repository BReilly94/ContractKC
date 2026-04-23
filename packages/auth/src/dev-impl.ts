import type { User, UserId } from '@ckb/domain';
import { asBrandedId, UnauthorizedError } from '@ckb/shared';
import { jwtVerify, SignJWT } from 'jose';
import type { AuthProvider, Principal } from './interface.js';

const DEV_ISSUER = 'ckb-local-dev';

export interface DevAuthConfig {
  readonly signingSecret: string;
  readonly users: readonly User[];
}

export class DevAuthProvider implements AuthProvider {
  readonly mode = 'local-dev' as const;
  private readonly secretKey: Uint8Array;
  private readonly users: ReadonlyMap<UserId, User>;

  constructor(config: DevAuthConfig) {
    if (config.signingSecret.length < 16) {
      throw new Error('Dev signing secret must be at least 16 characters');
    }
    this.secretKey = new TextEncoder().encode(config.signingSecret);
    this.users = new Map(config.users.map((u) => [u.id, u]));
  }

  async issueDevToken(userId: UserId): Promise<string> {
    const user = this.users.get(userId);
    if (!user) throw new UnauthorizedError(`Unknown dev user ${userId}`);
    return new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer(DEV_ISSUER)
      .setExpirationTime('12h')
      .sign(this.secretKey);
  }

  async verifyToken(token: string): Promise<Principal | null> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, { issuer: DEV_ISSUER });
      const sub = payload.sub;
      if (typeof sub !== 'string') return null;
      const userId = asBrandedId<'User'>(sub);
      const user = this.users.get(userId);
      if (!user) return null;
      return { userId, user };
    } catch {
      return null;
    }
  }

  async listDevUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}

export class EntraAuthProviderStub implements AuthProvider {
  readonly mode = 'entra' as const;

  async verifyToken(_token: string): Promise<Principal | null> {
    throw new Error('Entra ID auth not yet implemented; use AUTH_MODE=local-dev');
  }

  async issueDevToken(_userId: UserId): Promise<string> {
    throw new Error('issueDevToken is dev-only and unavailable in entra mode');
  }

  async listDevUsers(): Promise<User[]> {
    throw new Error('listDevUsers is dev-only and unavailable in entra mode');
  }
}
