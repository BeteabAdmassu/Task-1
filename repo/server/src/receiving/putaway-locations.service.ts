import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PutawayLocation } from './entities/putaway-location.entity';
import { UpsertPutawayLocationDto } from './dto/upsert-putaway-location.dto';

@Injectable()
export class PutawayLocationsService {
  constructor(
    @InjectRepository(PutawayLocation)
    private readonly repo: Repository<PutawayLocation>,
  ) {}

  findAll(): Promise<PutawayLocation[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  findAllActive(): Promise<PutawayLocation[]> {
    return this.repo.find({ where: { isActive: true }, order: { code: 'ASC' } });
  }

  async findById(id: string): Promise<PutawayLocation> {
    const loc = await this.repo.findOne({ where: { id } });
    if (!loc) throw new NotFoundException('Putaway location not found');
    return loc;
  }

  async create(dto: UpsertPutawayLocationDto): Promise<PutawayLocation> {
    const existing = await this.repo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Location code '${dto.code}' already exists`);
    const loc = this.repo.create({
      code: dto.code,
      description: dto.description ?? null,
      zone: dto.zone ?? null,
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(loc);
  }

  async update(id: string, dto: UpsertPutawayLocationDto): Promise<PutawayLocation> {
    const loc = await this.findById(id);
    if (dto.code !== loc.code) {
      const existing = await this.repo.findOne({ where: { code: dto.code } });
      if (existing) throw new ConflictException(`Location code '${dto.code}' already exists`);
    }
    if (dto.code !== undefined) loc.code = dto.code;
    if (dto.description !== undefined) loc.description = dto.description ?? null;
    if (dto.zone !== undefined) loc.zone = dto.zone ?? null;
    if (dto.isActive !== undefined) loc.isActive = dto.isActive;
    return this.repo.save(loc);
  }

  async remove(id: string): Promise<void> {
    const loc = await this.findById(id);
    await this.repo.remove(loc);
  }
}
