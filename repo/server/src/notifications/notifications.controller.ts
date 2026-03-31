import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { NotificationService } from './notification.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

const ALL_ROLES = [
  Role.ADMINISTRATOR,
  Role.PROCUREMENT_MANAGER,
  Role.WAREHOUSE_CLERK,
  Role.PLANT_CARE_SPECIALIST,
  Role.SUPPLIER,
];

@Controller('notifications')
@Roles(...ALL_ROLES)
export class NotificationsController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  findAll(
    @Query('unreadOnly') unreadOnly: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.service.findForUser(userId, {
      unreadOnly: unreadOnly === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('unread-count')
  getUnreadCount(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.getUnreadCount(userId).then((count) => ({ count }));
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.markAllRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.markRead(id, userId);
  }

  @Get('preferences')
  getPreferences(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.getPreferences(userId);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  updatePreferences(@Body() dto: UpdatePreferencesDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.updatePreferences(userId, dto.preferences);
  }
}
