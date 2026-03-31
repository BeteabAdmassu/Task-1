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
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { User } from '../../users/user.entity';
import { ReceiptStatus } from '../../common/enums/receipt-status.enum';
import { ReceivingEntryMode } from '../../common/enums/receiving-entry-mode.enum';
import { ReceiptLineItem } from './receipt-line-item.entity';

@Entity('receipts')
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  receiptNumber: string;

  @Column({ type: 'uuid' })
  poId: string;

  @ManyToOne(() => PurchaseOrder, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'poId' })
  purchaseOrder: PurchaseOrder;

  @Column({ type: 'uuid' })
  receivedBy: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receivedBy' })
  receiver: User;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date | null;

  @Column({ type: 'enum', enum: ReceiptStatus, default: ReceiptStatus.IN_PROGRESS })
  status: ReceiptStatus;

  @Column({
    type: 'enum',
    enum: ReceivingEntryMode,
    default: ReceivingEntryMode.MANUAL,
  })
  entryMode: ReceivingEntryMode;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => ReceiptLineItem, (rli) => rli.receipt, { cascade: true, eager: true })
  lineItems: ReceiptLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
