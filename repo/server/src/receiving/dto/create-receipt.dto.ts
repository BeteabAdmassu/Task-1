import { IsUUID, IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { VarianceReasonCode } from '../../common/enums/variance-reason-code.enum';

export class CreateReceiptLineItemDto {
  @IsUUID()
  poLineItemId: string;

  @IsNumber()
  @Min(0)
  quantityExpected: number;

  @IsNumber()
  @Min(0)
  quantityReceived: number;

  @IsEnum(VarianceReasonCode)
  @IsOptional()
  varianceReasonCode?: VarianceReasonCode;

  @IsString()
  @IsOptional()
  varianceNotes?: string;

  @IsUUID()
  @IsOptional()
  putawayLocationId?: string;
}

export class CreateReceiptDto {
  @IsUUID()
  poId: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReceiptLineItemDto)
  lineItems: CreateReceiptLineItemDto[];
}
