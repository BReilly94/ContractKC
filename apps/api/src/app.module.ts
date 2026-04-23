import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccessModule } from './access/access.module.js';
import { GlobalsModule } from './common/globals.module.js';
import { CorrelationMiddleware } from './common/correlation.middleware.js';
import { GlobalExceptionFilter } from './common/exception.filter.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { HealthModule } from './health/health.module.js';
import { PartiesModule } from './parties/parties.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    GlobalsModule,
    HealthModule,
    ContractsModule,
    AccessModule,
    PartiesModule,
    UsersModule,
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
