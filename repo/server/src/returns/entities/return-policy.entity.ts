import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('return_policies')
export class ReturnPolicy {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', default: 14 })
  returnWindowDays: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 15 })
  restockingFeeDefault: number;

  @Column({ type: 'int', default: 7 })
  restockingFeeAfterDaysThreshold: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 20 })
  restockingFeeAfterDays: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
