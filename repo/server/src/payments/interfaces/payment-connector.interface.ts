export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  message?: string;
}

export interface IPaymentConnector {
  readonly name: string;

  processPayment(
    idempotencyKey: string,
    supplierId: string,
    amount: number,
    reference: string,
  ): Promise<PaymentResult>;

  processRefund(
    idempotencyKey: string,
    supplierId: string,
    amount: number,
    reference: string,
  ): Promise<PaymentResult>;

  getStatus(transactionId: string): Promise<PaymentResult>;
}

export const PAYMENT_CONNECTOR = 'PAYMENT_CONNECTOR';
