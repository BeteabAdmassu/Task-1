import { Module, ClassSerializerInterceptor } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ProcurementModule } from './procurement/procurement.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ReceivingModule } from './receiving/receiving.module';
import { ReturnsModule } from './returns/returns.module';
import { FundsLedgerModule } from './funds-ledger/funds-ledger.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { SearchModule } from './search/search.module';
import { DataQualityModule } from './data-quality/data-quality.module';
import { ObservabilityModule } from './observability/observability.module';
import { typeOrmConfig } from './config/typeorm.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmConfig),
    // Global rate limiter: 200 req / 60s per IP (generous default for API traffic)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    HealthModule,
    AuthModule,
    UsersModule,
    AdminModule,
    AuditModule,
    SuppliersModule,
    ProcurementModule,
    PurchaseOrdersModule,
    ReceivingModule,
    ReturnsModule,
    FundsLedgerModule,
    PaymentsModule,
    NotificationsModule,
    KnowledgeBaseModule,
    SearchModule,
    DataQualityModule,
    ObservabilityModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
