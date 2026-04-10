import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateRefundEntryDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  raId: string;
}
