import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnReasonCode } from '../../common/enums/return-reason-code.enum';

export class CreateReturnLineItemDto {
  @IsUUID()
  receiptLineItemId: string;

  @IsNumber()
  @Min(0.01)
  quantityReturned: number;

  @IsEnum(ReturnReasonCode)
  reasonCode: ReturnReasonCode;

  @IsString()
  @IsOptional()
  reasonNotes?: string;
}

export class CreateReturnDto {
  @IsUUID()
  receiptId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReturnLineItemDto)
  lineItems: CreateReturnLineItemDto[];
}
