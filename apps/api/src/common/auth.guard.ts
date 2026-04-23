import type { AuthProvider, Principal } from '@ckb/auth';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_PROVIDER } from './tokens.js';

export interface AuthedRequest extends Request {
  principal?: Principal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);
    const principal = await this.authProvider.verifyToken(token);
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.principal = principal;
    return true;
  }
}
