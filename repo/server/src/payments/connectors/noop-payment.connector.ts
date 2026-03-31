import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaymentConnector, PaymentResult } from '../interfaces/payment-connector.interface';
import { PaymentIdempotencyKey } from '../entities/payment-idempotency-key.entity';

@Injectable()
export class NoOpPaymentConnector implements IPaymentConnector {
  readonly name = 'noop';

  constructor(
    @InjectRepository(PaymentIdempotencyKey)
    private readonly idempotencyRepo: Repository<PaymentIdempotencyKey>,
  ) {}

  private async deduplicate(
    key: string,
    operation: string,
    produce: () => PaymentResult,
  ): Promise<PaymentResult> {
    const existing = await this.idempotencyRepo.findOne({ where: { key } });
    if (existing) return existing.result as unknown as PaymentResult;

    const result = produce();
    await this.idempotencyRepo.save({
      key,
      connectorName: this.name,
      operation,
      result: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  async processPayment(
    idempotencyKey: string,
    supplierId: string,
    amount: number,
    reference: string,
  ): Promise<PaymentResult> {
    void supplierId;
    void amount;
    void reference;
    return this.deduplicate(idempotencyKey, 'PAYMENT', () => ({
      success: true,
      transactionId: `noop-pay-${idempotencyKey}`,
      message: 'NoOp connector: payment recorded locally, no external call made',
    }));
  }

  async processRefund(
    idempotencyKey: string,
    supplierId: string,
    amount: number,
    reference: string,
  ): Promise<PaymentResult> {
    void supplierId;
    void amount;
    void reference;
    return this.deduplicate(idempotencyKey, 'REFUND', () => ({
      success: true,
      transactionId: `noop-ref-${idempotencyKey}`,
      message: 'NoOp connector: refund recorded locally, no external call made',
    }));
  }

  async getStatus(transactionId: string): Promise<PaymentResult> {
    void transactionId;
    return { success: true, message: 'NoOp connector: status tracking not available' };
  }
}
