import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentIdempotencyKey } from './entities/payment-idempotency-key.entity';
import { NoOpPaymentConnector } from './connectors/noop-payment.connector';
import { PAYMENT_CONNECTOR } from './interfaces/payment-connector.interface';

const connectorName = process.env.PAYMENT_CONNECTOR ?? 'noop';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PaymentIdempotencyKey])],
  providers: [
    NoOpPaymentConnector,
    {
      provide: PAYMENT_CONNECTOR,
      useFactory: (noop: NoOpPaymentConnector) => {
        if (connectorName === 'noop') return noop;
        // Future connectors registered here
        return noop;
      },
      inject: [NoOpPaymentConnector],
    },
  ],
  exports: [PAYMENT_CONNECTOR],
})
export class PaymentsModule {}
