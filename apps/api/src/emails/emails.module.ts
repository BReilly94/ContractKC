import { Module } from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import {
  ContractEmailsController,
  EmailsController,
  EmailThreadsController,
} from './emails.controller.js';
import { EmailsService } from './emails.service.js';

@Module({
  controllers: [ContractEmailsController, EmailsController, EmailThreadsController],
  providers: [EmailsService, ContractAccessService],
  exports: [EmailsService],
})
export class EmailsModule {}
