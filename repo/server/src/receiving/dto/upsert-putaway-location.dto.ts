import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpsertPutawayLocationDto {
  @IsString()
  @MaxLength(20)
  code: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  description?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  zone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
