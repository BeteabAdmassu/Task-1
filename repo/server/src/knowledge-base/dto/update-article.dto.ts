import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ArticleCategory } from '../../common/enums/article-category.enum';
import { ArticleStatus } from '../../common/enums/article-status.enum';

export class UpdateArticleDto {
  @IsString()
  @MaxLength(300)
  @IsOptional()
  title?: string;

  @IsEnum(ArticleCategory)
  @IsOptional()
  category?: ArticleCategory;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  changeSummary?: string;
}

export class PromoteArticleDto {
  @IsEnum(ArticleStatus)
  status: ArticleStatus;
}
