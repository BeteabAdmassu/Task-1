import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';

@Controller('admin')
@Roles(Role.ADMINISTRATOR)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUsers(@Query() query: QueryUsersDto) {
    return this.adminService.findAll(query);
  }

  @Post('users')
  async createUser(@Body() dto: CreateUserDto, @Req() req: Request) {
    const adminId = (req.user as { id: string }).id;
    return this.adminService.createUser(dto, adminId);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    const adminId = (req.user as { id: string }).id;
    return this.adminService.updateUser(id, dto, adminId);
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const adminId = (req.user as { id: string }).id;
    return this.adminService.resetPassword(id, adminId);
  }
}
