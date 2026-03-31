import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('payment_idempotency_keys')
export class PaymentIdempotencyKey {
  @PrimaryColumn({ length: 200 })
  key: string;

  @Column({ length: 50 })
  connectorName: string;

  @Column({ length: 20 })
  operation: string;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
