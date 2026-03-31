import { IsString, IsUUID, IsNumber, IsBoolean, IsOptional, MaxLength, Min } from 'class-validator';

export class CreateCatalogItemDto {
  @IsString()
  @MaxLength(300)
  title: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  unitSize?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  upc?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitPrice?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
