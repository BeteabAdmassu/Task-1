import { IsInt, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateReturnPolicyDto {
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  returnWindowDays?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  restockingFeeDefault?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  restockingFeeAfterDaysThreshold?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  restockingFeeAfterDays?: number;
}
