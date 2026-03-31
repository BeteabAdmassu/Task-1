/**
 * Unit tests for KnowledgeBaseService – role-based authorization.
 *
 * Covers:
 *  - PLANT_CARE_SPECIALIST can update their own DRAFT article
 *  - PLANT_CARE_SPECIALIST cannot update an article owned by another user
 *  - PLANT_CARE_SPECIALIST cannot update a non-DRAFT (promoted) article
 *  - ADMINISTRATOR can update any non-archived article without restriction
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { KnowledgeBaseService } from './knowledge-base.service';
import { Article } from './entities/article.entity';
import { ArticleVersion } from './entities/article-version.entity';
import { UserFavorite } from './entities/user-favorite.entity';
import { ArticleStatus } from '../common/enums/article-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { UpdateArticleDto } from './dto/update-article.dto';

const ARTICLE_ID = '00000000-0000-0000-0000-000000000001';
const SPECIALIST_ID = 'specialist-user-id';
const OTHER_USER_ID = 'other-user-id';

function makeMockArticle(overrides: Partial<Article>): Article {
  return {
    id: ARTICLE_ID,
    title: 'Test Article',
    slug: 'test-article',
    content: 'Some content',
    tags: [],
    status: ArticleStatus.DRAFT,
    authorId: SPECIALIST_ID,
    currentVersionId: null,
    fingerprint: null,
    category: 'GENERAL' as any,
    author: null as any,
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Article;
}

describe('KnowledgeBaseService – specialist authoring & authorization', () => {
  let service: KnowledgeBaseService;

  const mockArticleRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((_: any, data: Partial<Article>) => ({ ...data })),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  };

  const mockVersionRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFavoriteRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  // Minimal manager mock for the transaction callback
  const mockManager = {
    create: jest.fn().mockImplementation((_: any, data: object) => ({ ...data })),
    save: jest.fn().mockImplementation(async (_: any, data: object) => ({ ...data, id: ARTICLE_ID })),
    update: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '1' }),
    }),
  };

  const mockDataSource = {
    transaction: jest.fn().mockImplementation(async (cb: (m: typeof mockManager) => Promise<unknown>) =>
      cb(mockManager),
    ),
  };

  const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
  const mockNotificationService = { emit: jest.fn().mockResolvedValue(undefined) };
  const mockDataQuality = {
    generateFingerprint: jest.fn().mockReturnValue('mock-fp'),
    checkForDuplicates: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: getRepositoryToken(Article), useValue: mockArticleRepo },
        { provide: getRepositoryToken(ArticleVersion), useValue: mockVersionRepo },
        { provide: getRepositoryToken(UserFavorite), useValue: mockFavoriteRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: DataQualityService, useValue: mockDataQuality },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: findById spy returns the article as-is (for the post-update return)
    jest.spyOn(service, 'findById').mockResolvedValue(makeMockArticle({}));
    mockDataSource.transaction.mockImplementation(
      async (cb: (m: typeof mockManager) => Promise<unknown>) => cb(mockManager),
    );
  });

  const dto: UpdateArticleDto = { content: 'Updated content' };

  // ── Specialist editing their own DRAFT ──────────────────────────────────────

  describe('PLANT_CARE_SPECIALIST updating their own DRAFT', () => {
    it('succeeds without throwing', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.DRAFT, authorId: SPECIALIST_ID }),
      );

      await expect(
        service.update(ARTICLE_ID, SPECIALIST_ID, Role.PLANT_CARE_SPECIALIST, dto),
      ).resolves.not.toThrow();
    });

    it('calls the transaction to persist changes', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.DRAFT, authorId: SPECIALIST_ID }),
      );

      await service.update(ARTICLE_ID, SPECIALIST_ID, Role.PLANT_CARE_SPECIALIST, dto);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── Specialist editing another author's article ────────────────────────────

  describe('PLANT_CARE_SPECIALIST updating another user\'s article', () => {
    it('throws ForbiddenException', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.DRAFT, authorId: OTHER_USER_ID }),
      );

      await expect(
        service.update(ARTICLE_ID, SPECIALIST_ID, Role.PLANT_CARE_SPECIALIST, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not enter the transaction', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.DRAFT, authorId: OTHER_USER_ID }),
      );

      await service
        .update(ARTICLE_ID, SPECIALIST_ID, Role.PLANT_CARE_SPECIALIST, dto)
        .catch(() => undefined);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  // ── Specialist editing a promoted (non-DRAFT) article ──────────────────────

  describe('PLANT_CARE_SPECIALIST updating a SPECIALIST_ONLY article (already promoted)', () => {
    it('throws ForbiddenException', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.SPECIALIST_ONLY, authorId: SPECIALIST_ID }),
      );

      await expect(
        service.update(ARTICLE_ID, SPECIALIST_ID, Role.PLANT_CARE_SPECIALIST, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('PLANT_CARE_SPECIALIST updating a STOREWIDE article', () => {
    it('throws ForbiddenException', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.STOREWIDE, authorId: SPECIALIST_ID }),
      );

      await expect(
        service.update(ARTICLE_ID, SPECIALIST_ID, Role.PLANT_CARE_SPECIALIST, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Administrator has no specialist restrictions ───────────────────────────

  describe('ADMINISTRATOR updating any non-archived article', () => {
    it('can update a STOREWIDE article', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.STOREWIDE, authorId: OTHER_USER_ID }),
      );

      await expect(
        service.update(ARTICLE_ID, 'admin-user-id', Role.ADMINISTRATOR, dto),
      ).resolves.not.toThrow();
    });

    it('can update another user\'s DRAFT', async () => {
      mockArticleRepo.findOne.mockResolvedValue(
        makeMockArticle({ status: ArticleStatus.DRAFT, authorId: OTHER_USER_ID }),
      );

      await expect(
        service.update(ARTICLE_ID, 'admin-user-id', Role.ADMINISTRATOR, dto),
      ).resolves.not.toThrow();
    });
  });

  // ── Article not found ──────────────────────────────────────────────────────

  describe('article not found', () => {
    it('throws NotFoundException', async () => {
      mockArticleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(ARTICLE_ID, SPECIALIST_ID, Role.PLANT_CARE_SPECIALIST, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
