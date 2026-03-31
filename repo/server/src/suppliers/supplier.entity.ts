import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentTerms } from '../common/enums/payment-terms.enum';
import { encryptedColumnTransformer } from '../common/utils/encryption';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'enum', enum: PaymentTerms, default: PaymentTerms.NET_30 })
  paymentTerms: PaymentTerms;

  @Column({ type: 'text', nullable: true })
  customTermsDescription: string | null;

  @Column({
    type: 'text',
    nullable: true,
    transformer: encryptedColumnTransformer,
  })
  bankingNotes: string | null;

  @Column({
    type: 'text',
    nullable: true,
    transformer: encryptedColumnTransformer,
  })
  internalRiskFlag: string | null;

  /**
   * Optional spending cap (in dollars). When set, issuing a PO that would push
   * the supplier's committed spend over this limit requires an ADMINISTRATOR override.
   * Null means no cap is enforced.
   */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, default: null })
  budgetCap: number | null;

  @Column({ type: 'text', nullable: true })
  fingerprint: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
