import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAdjustmentDto {
  @IsNumber()
  amount: number; // positive or negative

  @IsString()
  description: string;

  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsOptional()
  referenceType?: string;
}
