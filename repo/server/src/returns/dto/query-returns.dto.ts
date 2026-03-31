import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReturnStatus } from '../../common/enums/return-status.enum';

export class QueryReturnsDto {
  @IsEnum(ReturnStatus)
  @IsOptional()
  status?: ReturnStatus;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsOptional()
  dateFrom?: string;

  @IsString()
  @IsOptional()
  dateTo?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  limit?: string;
}
