import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchSynonym } from './entities/search-synonym.entity';
import { SearchHistory } from './entities/search-history.entity';
import { Article } from '../knowledge-base/entities/article.entity';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { AdminSynonymsController } from './admin-synonyms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SearchSynonym, SearchHistory, Article])],
  controllers: [SearchController, AdminSynonymsController],
  providers: [SearchService],
})
export class SearchModule {}
