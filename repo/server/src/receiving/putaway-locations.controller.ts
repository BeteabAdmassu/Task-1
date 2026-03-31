import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { PutawayLocationsService } from './putaway-locations.service';
import { UpsertPutawayLocationDto } from './dto/upsert-putaway-location.dto';

@Controller('putaway-locations')
export class PutawayLocationsController {
  constructor(private readonly service: PutawayLocationsService) {}

  @Get()
  @Roles(Role.WAREHOUSE_CLERK, Role.ADMINISTRATOR)
  findAll(@Query('activeOnly') activeOnly?: string) {
    return activeOnly === 'true'
      ? this.service.findAllActive()
      : this.service.findAllActive(); // default to active-only for dropdown use
  }
}

@Controller('admin/putaway-locations')
@Roles(Role.ADMINISTRATOR)
export class AdminPutawayLocationsController {
  constructor(private readonly service: PutawayLocationsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: UpsertPutawayLocationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertPutawayLocationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
