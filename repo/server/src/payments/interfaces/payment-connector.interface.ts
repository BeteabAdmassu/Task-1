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

  /**
   * Validates an inbound callback/webhook from the payment provider.
   * Real connectors verify an HMAC signature from the request headers.
   * The noop connector always returns true (no external service involved).
   */
  verifyCallback(headers: Record<string, string>, body: unknown): boolean;
}

export const PAYMENT_CONNECTOR = 'PAYMENT_CONNECTOR';
