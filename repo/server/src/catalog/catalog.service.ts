import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { CatalogItem } from './entities/catalog-item.entity';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { QueryCatalogItemsDto } from './dto/query-catalog-items.dto';
import { DataQualityService } from '../data-quality/data-quality.service';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(CatalogItem)
    private readonly catalogRepo: Repository<CatalogItem>,
    private readonly dataQuality: DataQualityService,
  ) {}

  private buildFingerprint(item: { title: string; supplierId?: string | null; unitSize?: string | null; upc?: string | null }): string {
    return this.dataQuality.generateFingerprint([
      item.title,
      item.supplierId ?? undefined,
      item.unitSize ?? undefined,
      item.upc ?? undefined,
    ]);
  }

  async findAll(query: QueryCatalogItemsDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<CatalogItem>[] = [];
    const baseWhere: FindOptionsWhere<CatalogItem> = {};

    if (query.supplierId) baseWhere.supplierId = query.supplierId;
    if (query.isActive !== undefined) baseWhere.isActive = query.isActive === 'true';

    if (query.search) {
      where.push(
        { ...baseWhere, title: ILike(`%${query.search}%`) },
        { ...baseWhere, description: ILike(`%${query.search}%`) },
      );
    } else {
      where.push(baseWhere);
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
    const allowedSortFields = ['title', 'unitPrice', 'isActive', 'createdAt'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [data, total] = await this.catalogRepo.findAndCount({
      where,
      relations: ['supplier'],
      order: { [orderField]: sortOrder },
      skip,
      take: limit,
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<CatalogItem> {
    const item = await this.catalogRepo.findOne({
      where: { id },
      relations: ['supplier'],
    });
    if (!item) throw new NotFoundException('Catalog item not found');
    return item;
  }

  async create(dto: CreateCatalogItemDto): Promise<CatalogItem> {
    const fingerprint = this.buildFingerprint(dto as any);
    const item = this.catalogRepo.create({
      ...dto,
      fingerprint,
    });
    const saved = await this.catalogRepo.save(item);
    this.dataQuality
      .checkForDuplicates('CatalogItem', saved.id, fingerprint)
      .catch(() => undefined);
    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateCatalogItemDto): Promise<CatalogItem> {
    const item = await this.findById(id);
    Object.assign(item, dto);
    const fingerprint = this.buildFingerprint(item);
    item.fingerprint = fingerprint;
    const saved = await this.catalogRepo.save(item);
    this.dataQuality
      .checkForDuplicates('CatalogItem', saved.id, fingerprint)
      .catch(() => undefined);
    return this.findById(saved.id);
  }

  async findAllForDropdown(): Promise<Pick<CatalogItem, 'id' | 'title'>[]> {
    return this.catalogRepo.find({
      where: { isActive: true },
      select: ['id', 'title'],
      order: { title: 'ASC' },
    });
  }
}
