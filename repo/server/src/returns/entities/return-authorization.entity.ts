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
import { Receipt } from '../../receiving/entities/receipt.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { Supplier } from '../../suppliers/supplier.entity';
import { User } from '../../users/user.entity';
import { ReturnStatus } from '../../common/enums/return-status.enum';
import { ReturnLineItem } from './return-line-item.entity';

@Entity('return_authorizations')
export class ReturnAuthorization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  raNumber: string;

  @Column({ type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => Receipt, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receiptId' })
  receipt: Receipt;

  @Column({ type: 'uuid', nullable: true })
  poId: string | null;

  @ManyToOne(() => PurchaseOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'poId' })
  purchaseOrder: PurchaseOrder | null;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator: User | null;

  @Column({ type: 'enum', enum: ReturnStatus, default: ReturnStatus.DRAFT })
  status: ReturnStatus;

  @Column({ type: 'int', default: 14 })
  returnWindowDays: number;

  @Column({ type: 'date' })
  returnDeadline: string;

  @OneToMany(() => ReturnLineItem, (rli) => rli.returnAuthorization, {
    cascade: true,
    eager: true,
  })
  lineItems: ReturnLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
