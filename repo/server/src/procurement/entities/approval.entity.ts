import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurchaseRequest } from './purchase-request.entity';
import { User } from '../../users/user.entity';
import { ApprovalAction } from '../../common/enums/approval-action.enum';

@Entity('approvals')
export class Approval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  requestId: string;

  @ManyToOne(() => PurchaseRequest, (pr) => pr.approvals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request: PurchaseRequest;

  @Column()
  approverId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approverId' })
  approver: User;

  @Column({ type: 'enum', enum: ApprovalAction })
  action: ApprovalAction;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
