import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto, PromoteArticleDto } from './dto/update-article.dto';
import { QueryArticlesDto } from './dto/query-articles.dto';

// ── Articles ──────────────────────────────────────────────────────────────────

@Controller('articles')
@Roles(
  Role.ADMINISTRATOR,
  Role.PLANT_CARE_SPECIALIST,
  Role.WAREHOUSE_CLERK,
  Role.PROCUREMENT_MANAGER,
)
export class ArticlesController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Get()
  findAll(@Query() query: QueryArticlesDto, @Req() req: Request) {
    const { id, role } = req.user as { id: string; role: string };
    return this.service.findAll(id, role, query);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @Req() req: Request) {
    const { id, role } = req.user as { id: string; role: string };
    return this.service.findBySlug(slug, id, role);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { id: userId, role } = req.user as { id: string; role: string };
    return this.service.findById(id, userId, role);
  }

  @Post()
  @Roles(Role.ADMINISTRATOR, Role.PLANT_CARE_SPECIALIST)
  create(@Body() dto: CreateArticleDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.create(userId, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRATOR, Role.PLANT_CARE_SPECIALIST)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @Req() req: Request,
  ) {
    const { id: userId, role } = req.user as { id: string; role: string };
    return this.service.update(id, userId, role, dto);
  }

  @Patch(':id/promote')
  @Roles(Role.ADMINISTRATOR)
  @HttpCode(HttpStatus.OK)
  promote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromoteArticleDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.service.promote(id, userId, dto);
  }

  // ── Versions ────────────────────────────────────────────────────────────────

  @Get(':id/versions')
  getVersions(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { id: userId, role } = req.user as { id: string; role: string };
    return this.service.getVersions(id, userId, role);
  }

  @Get(':id/versions/:versionNumber')
  getVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @Req() req: Request,
  ) {
    const { id: userId, role } = req.user as { id: string; role: string };
    return this.service.getVersion(id, versionNumber, userId, role);
  }

  // ── Per-article favorite toggle ──────────────────────────────────────────────

  @Post(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  addFavorite(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.addFavorite(userId, id);
  }

  @Delete(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFavorite(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.removeFavorite(userId, id);
  }

  @Get(':id/favorite')
  isFavorited(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.isFavorited(userId, id);
  }
}

// ── User favorites collection ─────────────────────────────────────────────────

@Controller('users/me/favorites')
@Roles(
  Role.ADMINISTRATOR,
  Role.PLANT_CARE_SPECIALIST,
  Role.WAREHOUSE_CLERK,
  Role.PROCUREMENT_MANAGER,
)
export class UserFavoritesController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Get()
  getFavorites(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.getFavorites(userId);
  }
}
