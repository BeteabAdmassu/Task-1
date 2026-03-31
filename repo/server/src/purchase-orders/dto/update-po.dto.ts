import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdatePoDto {
  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
