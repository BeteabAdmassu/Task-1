import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SearchService } from './search.service';
import { CreateSynonymDto } from './dto/create-synonym.dto';
import { UpdateSynonymDto } from './dto/update-synonym.dto';

@Controller('admin/synonyms')
@Roles(Role.ADMINISTRATOR)
export class AdminSynonymsController {
  constructor(private readonly service: SearchService) {}

  @Get()
  findAll() {
    return this.service.findAllSynonyms();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findSynonym(id);
  }

  @Post()
  create(@Body() dto: CreateSynonymDto) {
    return this.service.createSynonym(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSynonymDto) {
    return this.service.updateSynonym(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteSynonym(id);
  }
}
