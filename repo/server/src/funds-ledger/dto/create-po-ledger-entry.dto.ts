import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreatePoLedgerEntryDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  poId: string;
}
