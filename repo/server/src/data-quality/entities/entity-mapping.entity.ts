import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('entity_mappings')
export class EntityMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  entityType: string;

  @Column({ type: 'uuid' })
  oldId: string;

  @Column({ type: 'uuid' })
  newId: string;

  @CreateDateColumn()
  mergedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  mergedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'mergedBy' })
  merger: User | null;
}
