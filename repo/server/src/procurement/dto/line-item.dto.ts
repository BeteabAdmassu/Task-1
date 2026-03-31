import { IsString, IsNumber, IsOptional, IsUUID, MaxLength, Min } from 'class-validator';

export class LineItemDto {
  @IsString()
  @MaxLength(300)
  itemDescription: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsUUID()
  @IsOptional()
  catalogItemId?: string;
}
