import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from './entities/article.entity';
import { ArticleVersion } from './entities/article-version.entity';
import { UserFavorite } from './entities/user-favorite.entity';
import { KnowledgeBaseService } from './knowledge-base.service';
import { ArticlesController, UserFavoritesController } from './articles.controller';
import { AuditModule } from '../audit/audit.module';
import { DataQualityModule } from '../data-quality/data-quality.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, ArticleVersion, UserFavorite]),
    AuditModule,
    DataQualityModule,
  ],
  controllers: [ArticlesController, UserFavoritesController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
