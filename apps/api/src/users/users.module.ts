import { Module } from '@nestjs/common';
import { DevAuthController } from './dev-auth.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, DevAuthController],
  providers: [UsersService],
})
export class UsersModule {}
