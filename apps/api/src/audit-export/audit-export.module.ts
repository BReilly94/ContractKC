import { Module } from '@nestjs/common';
import { AuditExportController } from './audit-export.controller.js';
import { AuditExportService } from './audit-export.service.js';

@Module({
  controllers: [AuditExportController],
  providers: [AuditExportService],
  exports: [AuditExportService],
})
export class AuditExportModule {}
