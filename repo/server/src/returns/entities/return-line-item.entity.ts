import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReturnAuthorization } from './return-authorization.entity';
import { ReceiptLineItem } from '../../receiving/entities/receipt-line-item.entity';
import { ReturnReasonCode } from '../../common/enums/return-reason-code.enum';

@Entity('return_line_items')
export class ReturnLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  raId: string;

  @ManyToOne(() => ReturnAuthorization, (ra) => ra.lineItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raId' })
  returnAuthorization: ReturnAuthorization;

  @Column({ type: 'uuid' })
  receiptLineItemId: string;

  @ManyToOne(() => ReceiptLineItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receiptLineItemId' })
  receiptLineItem: ReceiptLineItem;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantityReturned: number;

  @Column({ type: 'enum', enum: ReturnReasonCode })
  reasonCode: ReturnReasonCode;

  @Column({ type: 'text', nullable: true })
  reasonNotes: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  restockingFeePercent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  restockingFeeAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  refundAmount: number;
}
