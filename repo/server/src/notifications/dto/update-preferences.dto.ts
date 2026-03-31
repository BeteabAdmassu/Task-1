import { IsArray, IsBoolean, IsEnum } from 'class-validator';
import { NotificationType } from '../../common/enums/notification-type.enum';

export class PreferenceItemDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsBoolean()
  isEnabled: boolean;
}

export class UpdatePreferencesDto {
  @IsArray()
  preferences: PreferenceItemDto[];
}
