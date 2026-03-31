import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { ArticleCategory } from '../../common/enums/article-category.enum';
import { ArticleStatus } from '../../common/enums/article-status.enum';

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 300 })
  title: string;

  @Column({ length: 300, unique: true })
  slug: string;

  @Column({ type: 'enum', enum: ArticleCategory, default: ArticleCategory.GENERAL })
  category: ArticleCategory;

  @Column({ type: 'text' })
  content: string;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'enum', enum: ArticleStatus, default: ArticleStatus.DRAFT })
  status: ArticleStatus;

  @Column({ type: 'text', nullable: true })
  fingerprint: string | null;

  @Column({ type: 'uuid', nullable: true })
  currentVersionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  authorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'authorId' })
  author: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
