import { Module } from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import { ContactsController, ContractContactsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';

@Module({
  controllers: [ContractContactsController, ContactsController],
  providers: [ContactsService, ContractAccessService],
  exports: [ContactsService],
})
export class ContactsModule {}
