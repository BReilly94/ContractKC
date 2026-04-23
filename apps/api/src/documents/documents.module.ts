import { Module } from '@nestjs/common';
import { ContractAccessService } from '../common/access.service.js';
import { ContractDocumentsController, DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  controllers: [ContractDocumentsController, DocumentsController],
  providers: [DocumentsService, ContractAccessService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
