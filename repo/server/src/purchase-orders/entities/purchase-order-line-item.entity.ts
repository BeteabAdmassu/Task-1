import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';

@Entity('purchase_order_line_items')
export class PurchaseOrderLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @ManyToOne(() => PurchaseOrder, (po) => po.lineItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  purchaseOrder: PurchaseOrder;

  @Column({ length: 300 })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityReceived: number;

  @Column({ type: 'uuid', nullable: true })
  catalogItemId: string | null;
}
