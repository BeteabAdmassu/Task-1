import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { DuplicateCandidateStatus } from '../../common/enums/duplicate-candidate-status.enum';

@Entity('duplicate_candidates')
export class DuplicateCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  entityType: string;

  @Column({ type: 'uuid' })
  sourceId: string;

  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  similarityScore: number;

  // true when similarity >= 0.97 (high-confidence auto-merge candidate)
  @Column({ type: 'boolean', default: false })
  isAutoMergeCandidate: boolean;

  @Column({
    type: 'enum',
    enum: DuplicateCandidateStatus,
    default: DuplicateCandidateStatus.PENDING_REVIEW,
  })
  status: DuplicateCandidateStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedBy' })
  reviewer: User | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
