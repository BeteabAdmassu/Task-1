import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurchaseRequest } from './purchase-request.entity';

@Entity('purchase_request_line_items')
export class PurchaseRequestLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  requestId: string;

  @ManyToOne(() => PurchaseRequest, (pr) => pr.lineItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request: PurchaseRequest;

  @Column({ length: 300 })
  itemDescription: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({ type: 'uuid', nullable: true })
  catalogItemId: string | null;
}
