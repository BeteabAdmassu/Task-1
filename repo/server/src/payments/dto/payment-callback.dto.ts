import { IsString, IsOptional, IsObject } from 'class-validator';

export class PaymentCallbackDto {
  /** Idempotency key supplied by the external payment provider. */
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  /** Name of the connector that triggered this callback (e.g. 'noop', 'stripe'). */
  @IsString()
  @IsOptional()
  connectorName?: string;

  /** Provider event type (e.g. 'payment.succeeded', 'refund.created'). */
  @IsString()
  @IsOptional()
  event?: string;

  /** Arbitrary provider payload; validated and stored as-is. */
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}
