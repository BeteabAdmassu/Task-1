import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApprovalAction } from '../../common/enums/approval-action.enum';

export class ApprovalActionDto {
  @IsEnum(ApprovalAction)
  action: ApprovalAction;

  @IsString()
  @IsOptional()
  comments?: string;
}
