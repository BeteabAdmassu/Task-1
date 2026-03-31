import { IsEnum } from 'class-validator';
import { ReturnStatus } from '../../common/enums/return-status.enum';

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatus)
  status: ReturnStatus;
}
