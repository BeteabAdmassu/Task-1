import { IsOptional, IsString, IsIn, IsNumberString } from 'class-validator';

export class QueryLogsDto {
  @IsOptional()
  @IsIn(['DEBUG', 'INFO', 'WARN', 'ERROR'])
  level?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
