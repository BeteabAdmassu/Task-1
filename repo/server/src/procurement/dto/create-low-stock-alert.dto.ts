import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LowStockLineItemDto {
  @IsString()
  @MaxLength(500)
  description: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateLowStockAlertDto {
  @IsString()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LowStockLineItemDto)
  items: LowStockLineItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
