import { Controller, Get, Param, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SearchService } from './search.service';

const ALL_STAFF = [
  Role.ADMINISTRATOR,
  Role.PLANT_CARE_SPECIALIST,
  Role.WAREHOUSE_CLERK,
  Role.PROCUREMENT_MANAGER,
];

@Controller()
@Roles(...ALL_STAFF)
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get('articles/search')
  search(
    @Query('q') q: string,
    @Query('category') category: string,
    @Query('tags') tags: string,
    @Req() req: Request,
  ) {
    const { id, role } = req.user as { id: string; role: string };
    return this.service.search(id, role, q ?? '', category, tags);
  }

  @Get('articles/:id/similar')
  similar(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { id: userId, role } = req.user as { id: string; role: string };
    return this.service.findSimilar(id, userId, role);
  }

  @Get('users/me/search-history')
  history(@Query('q') q: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.getHistory(userId, q);
  }
}
