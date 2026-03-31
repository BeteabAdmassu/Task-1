import { IsUUID, IsOptional, IsString } from 'class-validator';

export class QueryReceiptsDto {
  @IsUUID()
  @IsOptional()
  poId?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  limit?: string;
}
