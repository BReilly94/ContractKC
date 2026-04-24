import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccessModule } from './access/access.module.js';
import { BidHandoffModule } from './bid-handoff/bid-handoff.module.js';
import { ClaimReadinessModule } from './claim-readiness/claim-readiness.module.js';
import { ClaimsModule } from './claims/claims.module.js';
import { ClausesModule } from './clauses/clauses.module.js';
import { CloseoutModule } from './closeout/closeout.module.js';
import { ContactsModule } from './contacts/contacts.module.js';
import { GlobalsModule } from './common/globals.module.js';
import { CorrelationMiddleware } from './common/correlation.middleware.js';
import { GlobalExceptionFilter } from './common/exception.filter.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { DeadlinesModule } from './deadlines/deadlines.module.js';
import { DiaryModule } from './diary/diary.module.js';
import { DigestModule } from './digest/digest.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EmailsModule } from './emails/emails.module.js';
import { ErpModule } from './erp/erp.module.js';
import { EvidenceModule } from './evidence/evidence.module.js';
import { ExportsModule } from './exports/exports.module.js';
import { HealthModule } from './health/health.module.js';
import { InboundEmailModule } from './inbound/inbound.module.js';
import { InterpretationsModule } from './interpretations/interpretations.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OutboundModule } from './outbound/outbound.module.js';
import { PartiesModule } from './parties/parties.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PoliciesModule } from './policies/policies.module.js';
import { ProactiveFlagsModule } from './proactive-flags/proactive-flags.module.js';
import { QaModule } from './qa/qa.module.js';
import { RecordFlagsModule } from './record-flags/record-flags.module.js';
import { RedactionsModule } from './redactions/redactions.module.js';
import { ReviewQueueModule } from './review-queue/review-queue.module.js';
import { RisksModule } from './risks/risks.module.js';
import { SubmittalsModule } from './submittals/submittals.module.js';
import { TimelineModule } from './timeline/timeline.module.js';
import { VariationsModule } from './variations/variations.module.js';
import { SearchModule } from './search/search.module.js';
import { SenderTrustModule } from './sender-trust/sender-trust.module.js';
import { SummaryModule } from './summary/summary.module.js';
import { TagsModule } from './tags/tags.module.js';
import { UsersModule } from './users/users.module.js';
import { AuditExportModule } from './audit-export/audit-export.module.js';

@Module({
  imports: [
    GlobalsModule,
    HealthModule,
    NotificationsModule,
    ContractsModule,
    AccessModule,
    PartiesModule,
    UsersModule,
    BidHandoffModule,
    ClaimReadinessModule,
    ClaimsModule,
    ClausesModule,
    CloseoutModule,
    ContactsModule,
    DeadlinesModule,
    DiaryModule,
    DigestModule,
    DocumentsModule,
    EmailsModule,
    ErpModule,
    EvidenceModule,
    ExportsModule,
    InboundEmailModule,
    InterpretationsModule,
    OutboundModule,
    PaymentsModule,
    PoliciesModule,
    ProactiveFlagsModule,
    QaModule,
    RecordFlagsModule,
    RedactionsModule,
    ReviewQueueModule,
    RisksModule,
    SubmittalsModule,
    TimelineModule,
    VariationsModule,
    SearchModule,
    SenderTrustModule,
    SummaryModule,
    TagsModule,
    AuditExportModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
