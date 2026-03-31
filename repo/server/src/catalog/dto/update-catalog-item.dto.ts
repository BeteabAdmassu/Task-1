import { IsString, IsUUID, IsNumber, IsBoolean, IsOptional, MaxLength, Min } from 'class-validator';

export class UpdateCatalogItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(300)
  title?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  unitSize?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  upc?: string | null;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitPrice?: number | null;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
