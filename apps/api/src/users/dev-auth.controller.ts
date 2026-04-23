import type { AuthProvider } from '@ckb/auth';
import { asBrandedId, UnauthorizedError } from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { AUTH_PROVIDER } from '../common/tokens.js';

const IssueTokenBody = z.object({
  userId: z.string().length(26),
});

@Controller('api/dev')
export class DevAuthController {
  constructor(@Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider) {}

  private requireLocalDev(): void {
    if (this.authProvider.mode !== 'local-dev') {
      throw new ServiceUnavailableException('Dev auth endpoints are disabled (AUTH_MODE != local-dev)');
    }
  }

  @Get('users')
  async listDevUsers(): Promise<Array<{ id: string; email: string; displayName: string }>> {
    this.requireLocalDev();
    const users = await this.authProvider.listDevUsers();
    return users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName }));
  }

  @Post('token')
  async issueToken(@Body() rawBody: unknown): Promise<{ token: string }> {
    this.requireLocalDev();
    const body = IssueTokenBody.parse(rawBody);
    try {
      const token = await this.authProvider.issueDevToken(asBrandedId<'User'>(body.userId));
      return { token };
    } catch (e) {
      if (e instanceof UnauthorizedError) throw e;
      throw e;
    }
  }
}
