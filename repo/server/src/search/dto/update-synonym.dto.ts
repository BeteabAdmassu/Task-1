import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSynonymDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  term?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  synonyms?: string[];
}
