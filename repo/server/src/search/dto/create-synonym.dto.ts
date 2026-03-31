import { IsArray, IsString, MaxLength, ArrayNotEmpty } from 'class-validator';

export class CreateSynonymDto {
  @IsString()
  @MaxLength(200)
  term: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty()
  synonyms: string[];
}
