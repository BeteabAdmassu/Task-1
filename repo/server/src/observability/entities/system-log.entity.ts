import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('system_logs')
export class SystemLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true, length: 64 })
  requestId: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', default: 'INFO', length: 10 })
  level: string;

  @Column({ type: 'varchar', nullable: true, length: 100 })
  service: string | null;

  @Column('text')
  message: string;

  @Column({ type: 'varchar', nullable: true, length: 10 })
  method: string | null;

  @Column({ type: 'text', nullable: true })
  path: string | null;

  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
