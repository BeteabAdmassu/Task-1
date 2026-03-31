import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Article } from './entities/article.entity';
import { ArticleVersion } from './entities/article-version.entity';
import { UserFavorite } from './entities/user-favorite.entity';
import { ArticleStatus } from '../common/enums/article-status.enum';
import { ArticleCategory } from '../common/enums/article-category.enum';
import { Role } from '../common/enums/role.enum';
import { AuditAction } from '../common/enums/audit-action.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto, PromoteArticleDto } from './dto/update-article.dto';
import { QueryArticlesDto } from './dto/query-articles.dto';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(ArticleVersion)
    private readonly versionRepo: Repository<ArticleVersion>,
    @InjectRepository(UserFavorite)
    private readonly favoriteRepo: Repository<UserFavorite>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly dataQuality: DataQualityService,
  ) {}

  // ── Slug generation ───────────────────────────────────────────────────────

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .slice(0, 80);

    let slug = base || 'article';
    let attempt = 0;
    while (await this.articleRepo.findOne({ where: { slug } })) {
      slug = `${base}-${++attempt}`;
    }
    return slug;
  }

  // ── Visibility helpers ────────────────────────────────────────────────────

  private buildVisibilityCondition(
    qb: ReturnType<typeof this.articleRepo.createQueryBuilder>,
    userId: string,
    userRole: string,
  ) {
    if (userRole === Role.ADMINISTRATOR) {
      // Admin sees everything except ARCHIVED (still accessible by ID)
      qb.andWhere('a.status != :archived', { archived: ArticleStatus.ARCHIVED });
      return;
    }
    if (userRole === Role.PLANT_CARE_SPECIALIST) {
      qb.andWhere(
        '(a.status = :storewide OR a.status = :specialist OR (a.status = :draft AND a.authorId = :uid))',
        {
          storewide: ArticleStatus.STOREWIDE,
          specialist: ArticleStatus.SPECIALIST_ONLY,
          draft: ArticleStatus.DRAFT,
          uid: userId,
        },
      );
      return;
    }
    // All other roles: STOREWIDE + own DRAFTs
    qb.andWhere(
      '(a.status = :storewide OR (a.status = :draft AND a.authorId = :uid))',
      { storewide: ArticleStatus.STOREWIDE, draft: ArticleStatus.DRAFT, uid: userId },
    );
  }

  private canViewArticle(article: Article, userId: string, userRole: string): boolean {
    if (userRole === Role.ADMINISTRATOR) return true;
    if (article.status === ArticleStatus.ARCHIVED) return false;
    if (article.status === ArticleStatus.STOREWIDE) return true;
    if (article.status === ArticleStatus.SPECIALIST_ONLY && userRole === Role.PLANT_CARE_SPECIALIST)
      return true;
    if (article.status === ArticleStatus.DRAFT && article.authorId === userId) return true;
    return false;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateArticleDto): Promise<Article> {
    const slug = await this.generateUniqueSlug(dto.title);

    const article = await this.dataSource.transaction(async (manager) => {
      const a = manager.create(Article, {
        title: dto.title,
        slug,
        category: dto.category ?? ArticleCategory.GENERAL,
        content: dto.content,
        tags: dto.tags ?? [],
        status: ArticleStatus.DRAFT,
        authorId: userId,
        currentVersionId: null,
      });
      const saved = await manager.save(Article, a);

      // Create initial version
      const v = manager.create(ArticleVersion, {
        articleId: saved.id,
        versionNumber: 1,
        title: dto.title,
        content: dto.content,
        changeSummary: dto.changeSummary ?? 'Initial version',
        createdBy: userId,
      });
      const savedV = await manager.save(ArticleVersion, v);
      await manager.update(Article, saved.id, { currentVersionId: savedV.id });
      saved.currentVersionId = savedV.id;
      return saved;
    });

    const fingerprint = this.dataQuality.generateFingerprint([article.title]);
    await this.articleRepo.update(article.id, { fingerprint });
    this.dataQuality.checkForDuplicates('Article', article.id, fingerprint).catch(() => undefined);

    await this.auditService.log(userId, AuditAction.ARTICLE_CREATED, 'Article', article.id, {
      title: article.title,
      slug: article.slug,
    });

    return this.findById(article.id, userId, Role.ADMINISTRATOR);
  }

  async update(id: string, userId: string, userRole: string, dto: UpdateArticleDto): Promise<Article> {
    const article = await this.articleRepo.findOne({ where: { id } });
    if (!article) throw new NotFoundException('Article not found');
    if (article.status === ArticleStatus.ARCHIVED)
      throw new ForbiddenException('Cannot edit an archived article');

    // Specialists may only edit their own draft articles; promotion stays admin-controlled.
    if (userRole === Role.PLANT_CARE_SPECIALIST) {
      if (article.authorId !== userId)
        throw new ForbiddenException('Specialists may only edit their own articles');
      if (article.status !== ArticleStatus.DRAFT)
        throw new ForbiddenException('Specialists may only edit draft articles');
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.title !== undefined) article.title = dto.title;
      if (dto.category !== undefined) article.category = dto.category;
      if (dto.content !== undefined) article.content = dto.content;
      if (dto.tags !== undefined) article.tags = dto.tags;

      await manager.save(Article, article);

      // Get next version number
      const maxResult = await manager
        .createQueryBuilder()
        .select('MAX(av."versionNumber")', 'max')
        .from(ArticleVersion, 'av')
        .where('av."articleId" = :id', { id })
        .getRawOne<{ max: string }>();
      const nextVersion = (parseInt(maxResult?.max ?? '0', 10) || 0) + 1;

      const v = manager.create(ArticleVersion, {
        articleId: id,
        versionNumber: nextVersion,
        title: article.title,
        content: article.content,
        changeSummary: dto.changeSummary ?? null,
        createdBy: userId,
      });
      const savedV = await manager.save(ArticleVersion, v);
      await manager.update(Article, id, { currentVersionId: savedV.id });
    });

    const fingerprint = this.dataQuality.generateFingerprint([article.title]);
    await this.articleRepo.update(id, { fingerprint });
    this.dataQuality.checkForDuplicates('Article', id, fingerprint).catch(() => undefined);

    await this.auditService.log(userId, AuditAction.ARTICLE_UPDATED, 'Article', id, {
      title: article.title,
    });

    return this.findById(id, userId, userRole);
  }

  async promote(id: string, userId: string, dto: PromoteArticleDto): Promise<Article> {
    const article = await this.articleRepo.findOne({ where: { id } });
    if (!article) throw new NotFoundException('Article not found');

    const prevStatus = article.status;
    await this.articleRepo.update(id, { status: dto.status });

    const action =
      dto.status === ArticleStatus.ARCHIVED
        ? AuditAction.ARTICLE_ARCHIVED
        : AuditAction.ARTICLE_PROMOTED;

    await this.auditService.log(userId, action, 'Article', id, {
      title: article.title,
      previousStatus: prevStatus,
      newStatus: dto.status,
    });

    if (
      article.authorId &&
      (dto.status === ArticleStatus.STOREWIDE || dto.status === ArticleStatus.SPECIALIST_ONLY)
    ) {
      const audience =
        dto.status === ArticleStatus.STOREWIDE ? 'all staff' : 'plant care specialists';
      await this.notificationService.emit(
        article.authorId,
        NotificationType.ARTICLE_PUBLISHED,
        'Article Published',
        `Your article "${article.title}" has been published and is now visible to ${audience}.`,
        { type: 'Article', id },
      );
    }

    return this.findById(id, userId, Role.ADMINISTRATOR);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async findAll(userId: string, userRole: string, query: QueryArticlesDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const qb = this.articleRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.author', 'author')
      .orderBy('a.updatedAt', 'DESC')
      .skip(skip)
      .take(limit);

    this.buildVisibilityCondition(qb, userId, userRole);

    if (query.search) {
      qb.andWhere(
        '(a.title ILIKE :search OR a.content ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.category) qb.andWhere('a.category = :category', { category: query.category });
    if (query.status && userRole === Role.ADMINISTRATOR)
      qb.andWhere('a.status = :status', { status: query.status });
    if (query.tag)
      qb.andWhere(':tag = ANY(a.tags)', { tag: query.tag });

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, userId: string, userRole: string): Promise<Article> {
    const article = await this.articleRepo.findOne({
      where: { id },
      relations: ['author'],
    });
    if (!article) throw new NotFoundException('Article not found');
    if (!this.canViewArticle(article, userId, userRole)) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  async findBySlug(slug: string, userId: string, userRole: string): Promise<Article> {
    const article = await this.articleRepo.findOne({ where: { slug }, relations: ['author'] });
    if (!article) throw new NotFoundException('Article not found');
    if (!this.canViewArticle(article, userId, userRole)) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  // ── Versions ──────────────────────────────────────────────────────────────

  async getVersions(articleId: string, userId: string, userRole: string) {
    await this.findById(articleId, userId, userRole); // visibility check
    return this.versionRepo.find({
      where: { articleId },
      order: { versionNumber: 'DESC' },
      relations: ['creator'],
    });
  }

  async getVersion(
    articleId: string,
    versionNumber: number,
    userId: string,
    userRole: string,
  ): Promise<ArticleVersion> {
    await this.findById(articleId, userId, userRole);
    const version = await this.versionRepo.findOne({
      where: { articleId, versionNumber },
      relations: ['creator'],
    });
    if (!version) throw new NotFoundException('Version not found');
    return version;
  }

  // ── Favorites ─────────────────────────────────────────────────────────────

  async addFavorite(userId: string, articleId: string): Promise<void> {
    const article = await this.articleRepo.findOne({ where: { id: articleId } });
    if (!article) throw new NotFoundException('Article not found');
    const existing = await this.favoriteRepo.findOne({ where: { userId, articleId } });
    if (existing) return; // idempotent
    await this.favoriteRepo.save({ userId, articleId });
  }

  async removeFavorite(userId: string, articleId: string): Promise<void> {
    await this.favoriteRepo.delete({ userId, articleId });
  }

  async isFavorited(userId: string, articleId: string): Promise<boolean> {
    const fav = await this.favoriteRepo.findOne({ where: { userId, articleId } });
    return !!fav;
  }

  async getFavorites(userId: string) {
    const favs = await this.favoriteRepo.find({
      where: { userId },
      relations: ['article', 'article.author'],
      order: { createdAt: 'DESC' },
    });
    return favs.map((f) => f.article).filter(Boolean);
  }
}
