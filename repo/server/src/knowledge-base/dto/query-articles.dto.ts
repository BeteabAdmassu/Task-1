import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ArticleCategory } from '../../common/enums/article-category.enum';
import { ArticleStatus } from '../../common/enums/article-status.enum';

export class QueryArticlesDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(ArticleCategory)
  @IsOptional()
  category?: ArticleCategory;

  @IsEnum(ArticleStatus)
  @IsOptional()
  status?: ArticleStatus;

  @IsString()
  @IsOptional()
  tag?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  limit?: string;
}
