import type { Principal } from '@ckb/auth';
import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { NotificationsService, type NotificationRow } from './notifications.service.js';

@Controller('api/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}

  @Get()
  async list(
    @GetPrincipal() principal: Principal,
    @Query('unread') unread?: string,
  ): Promise<NotificationRow[]> {
    return this.service.listForUser(principal.userId, {
      unreadOnly: unread === 'true',
    });
  }

  @Post(':id/read')
  async markRead(
    @GetPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.service.markRead(principal, id);
    return { ok: true };
  }

  @Post('read-all')
  async markAllRead(@GetPrincipal() principal: Principal): Promise<{ ok: true }> {
    await this.service.markAllRead(principal);
    return { ok: true };
  }
}
