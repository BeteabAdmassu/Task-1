import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '../../common/enums/notification-type.enum';

export class PreferenceItemDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsBoolean()
  isEnabled: boolean;
}

export class UpdatePreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences: PreferenceItemDto[];
}
