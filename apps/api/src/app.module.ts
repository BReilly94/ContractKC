import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccessModule } from './access/access.module.js';
import { ClausesModule } from './clauses/clauses.module.js';
import { ContactsModule } from './contacts/contacts.module.js';
import { GlobalsModule } from './common/globals.module.js';
import { CorrelationMiddleware } from './common/correlation.middleware.js';
import { GlobalExceptionFilter } from './common/exception.filter.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { DeadlinesModule } from './deadlines/deadlines.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EmailsModule } from './emails/emails.module.js';
import { HealthModule } from './health/health.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PartiesModule } from './parties/parties.module.js';
import { QaModule } from './qa/qa.module.js';
import { ReviewQueueModule } from './review-queue/review-queue.module.js';
import { SearchModule } from './search/search.module.js';
import { SenderTrustModule } from './sender-trust/sender-trust.module.js';
import { SummaryModule } from './summary/summary.module.js';
import { TagsModule } from './tags/tags.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    GlobalsModule,
    HealthModule,
    NotificationsModule,
    ContractsModule,
    AccessModule,
    PartiesModule,
    UsersModule,
    ClausesModule,
    ContactsModule,
    DeadlinesModule,
    DocumentsModule,
    EmailsModule,
    QaModule,
    ReviewQueueModule,
    SearchModule,
    SenderTrustModule,
    SummaryModule,
    TagsModule,
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
