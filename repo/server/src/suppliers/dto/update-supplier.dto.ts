import { IsString, IsEnum, IsBoolean, IsOptional, IsEmail, MaxLength } from 'class-validator';
import { PaymentTerms } from '../../common/enums/payment-terms.enum';

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  contactName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(200)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsEnum(PaymentTerms)
  @IsOptional()
  paymentTerms?: PaymentTerms;

  @IsString()
  @IsOptional()
  customTermsDescription?: string;

  @IsString()
  @IsOptional()
  bankingNotes?: string;

  @IsString()
  @IsOptional()
  internalRiskFlag?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
