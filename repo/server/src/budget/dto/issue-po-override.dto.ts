import { IsBoolean, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class IssuePoDto {
  /** Set to true to authorize a budget-cap override (ADMINISTRATOR only). */
  @IsBoolean()
  @IsOptional()
  override?: boolean;

  /** Required when override = true. Must be at least 10 characters. */
  @ValidateIf((o: IssuePoDto) => o.override === true)
  @IsString()
  @MinLength(10, { message: 'Override reason must be at least 10 characters' })
  overrideReason?: string;
}
