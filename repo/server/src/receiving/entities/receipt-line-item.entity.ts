import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Receipt } from './receipt.entity';
import { PurchaseOrderLineItem } from '../../purchase-orders/entities/purchase-order-line-item.entity';
import { PutawayLocation } from './putaway-location.entity';
import { VarianceReasonCode } from '../../common/enums/variance-reason-code.enum';

@Entity('receipt_line_items')
export class ReceiptLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => Receipt, (r) => r.lineItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receiptId' })
  receipt: Receipt;

  @Column({ type: 'uuid' })
  poLineItemId: string;

  @ManyToOne(() => PurchaseOrderLineItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'poLineItemId' })
  poLineItem: PurchaseOrderLineItem;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantityExpected: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantityReceived: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  varianceQuantity: number;

  @Column({
    type: 'enum',
    enum: VarianceReasonCode,
    default: VarianceReasonCode.NONE,
  })
  varianceReasonCode: VarianceReasonCode;

  @Column({ type: 'text', nullable: true })
  varianceNotes: string | null;

  @Column({ type: 'uuid', nullable: true })
  putawayLocationId: string | null;

  @ManyToOne(() => PutawayLocation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'putawayLocationId' })
  putawayLocation: PutawayLocation | null;
}
