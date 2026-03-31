import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('budget_overrides')
export class BudgetOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  poId: string;

  @Column({ type: 'uuid' })
  supplierId: string;

  @Column({ type: 'uuid' })
  authorizedBy: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'authorizedBy' })
  authorizer: User | null;

  /** The PO totalAmount that exceeded the cap */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  overrideAmount: number;

  /** Available budget at the time of override (may be negative) */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  availableAtTime: number;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}
