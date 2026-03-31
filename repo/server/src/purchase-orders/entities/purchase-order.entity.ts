import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Supplier } from '../../suppliers/supplier.entity';
import { PurchaseRequest } from '../../procurement/entities/purchase-request.entity';
import { PoStatus } from '../../common/enums/po-status.enum';
import { PurchaseOrderLineItem } from './purchase-order-line-item.entity';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  poNumber: string;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @ManyToOne(() => PurchaseRequest, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requestId' })
  request: PurchaseRequest | null;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier | null;

  @OneToMany(() => PurchaseOrderLineItem, (li) => li.purchaseOrder, {
    cascade: true,
    eager: true,
  })
  lineItems: PurchaseOrderLineItem[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'enum', enum: PoStatus, default: PoStatus.DRAFT })
  status: PoStatus;

  @Column({ type: 'timestamp', nullable: true })
  issuedAt: Date | null;

  @Column({ type: 'date', nullable: true })
  expectedDeliveryDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
