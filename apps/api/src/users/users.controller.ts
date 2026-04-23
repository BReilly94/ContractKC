import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { UsersService, type UserRow } from './users.service.js';

@Controller('api/users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  async list(@Query('is_pm') isPm?: string): Promise<UserRow[]> {
    const filter: { isPm?: boolean } = {};
    if (isPm === 'true') filter.isPm = true;
    if (isPm === 'false') filter.isPm = false;
    return this.users.list(filter);
  }
}
