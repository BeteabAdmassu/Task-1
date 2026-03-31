import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ArticleCategory } from '../../common/enums/article-category.enum';

export class CreateArticleDto {
  @IsString()
  @MaxLength(300)
  title: string;

  @IsEnum(ArticleCategory)
  @IsOptional()
  category?: ArticleCategory;

  @IsString()
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  changeSummary?: string;
}
