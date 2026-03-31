import {
  Controller,
  Post,
  Body,
  Req,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { IPaymentConnector, PAYMENT_CONNECTOR } from './interfaces/payment-connector.interface';
import { PaymentIdempotencyKey } from './entities/payment-idempotency-key.entity';
import { PaymentCallbackDto } from './dto/payment-callback.dto';

@Controller('payments')
export class PaymentCallbackController {
  constructor(
    @Inject(PAYMENT_CONNECTOR)
    private readonly connector: IPaymentConnector,
    @InjectRepository(PaymentIdempotencyKey)
    private readonly idempotencyRepo: Repository<PaymentIdempotencyKey>,
  ) {}

  /**
   * Receives inbound payment-provider webhooks / callbacks.
   *
   * - Marked @Public() — callbacks arrive without a user JWT.
   * - Signature is verified via `connector.verifyCallback()`; the noop connector
   *   always returns true so no external dependency is needed locally.
   * - Idempotent: a duplicate callback with the same key returns the stored result
   *   without any side effects.
   * - The idempotency key is resolved from (in order of preference):
   *     1. `body.idempotencyKey`
   *     2. `X-Idempotency-Key` request header
   */
  @Public()
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(
    @Body() body: PaymentCallbackDto,
    @Req() req: Request,
  ): Promise<{
    processed: boolean;
    alreadyProcessed: boolean;
    result: Record<string, unknown>;
  }> {
    // Verify provider signature — noop always passes; real connectors validate HMAC/JWT
    const headers = req.headers as Record<string, string>;
    if (!this.connector.verifyCallback(headers, body)) {
      throw new UnauthorizedException('Invalid callback signature');
    }

    // Resolve idempotency key
    const key =
      body.idempotencyKey?.trim() || (headers['x-idempotency-key'] ?? '').trim();
    if (!key) {
      throw new BadRequestException(
        'Missing idempotency key — supply body.idempotencyKey or X-Idempotency-Key header',
      );
    }

    // Idempotency check: return cached result for duplicate deliveries
    const existing = await this.idempotencyRepo.findOne({ where: { key } });
    if (existing) {
      return {
        processed: true,
        alreadyProcessed: true,
        result: existing.result as Record<string, unknown>,
      };
    }

    // Process the callback (connector-specific logic would go here for real providers)
    const result: Record<string, unknown> = {
      success: true,
      event: body.event ?? 'unknown',
      connectorName: body.connectorName ?? this.connector.name,
      processedAt: new Date().toISOString(),
    };

    await this.idempotencyRepo.save({
      key,
      connectorName: body.connectorName ?? this.connector.name,
      operation: `CALLBACK:${body.event ?? 'unknown'}`,
      result,
    });

    return { processed: true, alreadyProcessed: false, result };
  }
}
