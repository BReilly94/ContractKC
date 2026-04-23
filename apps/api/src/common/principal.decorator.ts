import type { Principal } from '@ckb/auth';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './auth.guard.js';

export const GetPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.principal) throw new Error('Principal not attached; AuthGuard must run first');
    return req.principal;
  },
);
