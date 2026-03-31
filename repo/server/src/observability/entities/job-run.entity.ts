import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('job_runs')
export class JobRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  jobName: string;

  @Column({ default: 'RUNNING', length: 20 })
  status: string; // RUNNING | SUCCESS | FAILED

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ default: 1 })
  attempt: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
