import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Supplier } from './supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySuppliersDto } from './dto/query-suppliers.dto';
import { DataQualityService } from '../data-quality/data-quality.service';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
    private readonly dataQuality: DataQualityService,
  ) {}

  async findAll(query: QuerySuppliersDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Supplier>[] = [];
    const baseWhere: FindOptionsWhere<Supplier> = {};

    if (query.paymentTerms) baseWhere.paymentTerms = query.paymentTerms;
    if (query.isActive !== undefined) baseWhere.isActive = query.isActive === 'true';

    if (query.search) {
      // Search by name or contactName
      where.push(
        { ...baseWhere, name: ILike(`%${query.search}%`) },
        { ...baseWhere, contactName: ILike(`%${query.search}%`) },
      );
    } else {
      where.push(baseWhere);
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as
      | 'ASC'
      | 'DESC';
    const allowedSortFields = ['name', 'contactName', 'paymentTerms', 'isActive', 'createdAt'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [data, total] = await this.suppliersRepository.findAndCount({
      where,
      order: { [orderField]: sortOrder },
      skip,
      take: limit,
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    const fingerprint = this.dataQuality.generateFingerprint([
      dto.name,
      dto.address,
    ]);
    const supplier = this.suppliersRepository.create({ ...dto, fingerprint });
    const saved = await this.suppliersRepository.save(supplier);
    this.dataQuality.checkForDuplicates('Supplier', saved.id, fingerprint).catch(() => undefined);
    return saved;
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findById(id);
    Object.assign(supplier, dto);
    supplier.fingerprint = this.dataQuality.generateFingerprint([
      supplier.name,
      supplier.address,
    ]);
    const saved = await this.suppliersRepository.save(supplier);
    this.dataQuality.checkForDuplicates('Supplier', saved.id, saved.fingerprint!).catch(() => undefined);
    return saved;
  }

  async findAllForDropdown(): Promise<Pick<Supplier, 'id' | 'name'>[]> {
    return this.suppliersRepository.find({
      where: { isActive: true },
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
  }
}
