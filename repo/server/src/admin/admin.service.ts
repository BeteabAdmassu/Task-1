import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../users/user.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryUsersDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.search) where.username = ILike(`%${query.search}%`);

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';

    const allowedSortFields = ['username', 'role', 'isActive', 'createdAt'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [data, total] = await this.usersRepository.findAndCount({
      where,
      order: { [orderField]: sortOrder },
      skip,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createUser(dto: CreateUserDto, adminUserId: string): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.usersRepository.create({
      username: dto.username,
      passwordHash,
      role: dto.role,
      isActive: dto.isActive ?? true,
      supplierId: dto.supplierId ?? null,
    });

    const saved = await this.usersRepository.save(user);

    await this.auditService.log(adminUserId, AuditAction.USER_CREATED, 'User', saved.id, {
      username: saved.username,
      role: saved.role,
    });

    return saved;
  }

  async updateUser(id: string, dto: UpdateUserDto, adminUserId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const changes: Record<string, unknown> = {};

    if (dto.role !== undefined && dto.role !== user.role) {
      changes.roleFrom = user.role;
      changes.roleTo = dto.role;
      user.role = dto.role;
    }

    if (dto.supplierId !== undefined) {
      changes.supplierIdFrom = user.supplierId;
      changes.supplierIdTo = dto.supplierId;
      user.supplierId = dto.supplierId;
    }

    if (dto.isActive !== undefined && dto.isActive !== user.isActive) {
      changes.isActiveFrom = user.isActive;
      changes.isActiveTo = dto.isActive;
      user.isActive = dto.isActive;
    }

    const saved = await this.usersRepository.save(user);

    const action = dto.isActive === false
      ? AuditAction.USER_DEACTIVATED
      : dto.isActive === true && changes.isActiveFrom === false
        ? AuditAction.USER_ACTIVATED
        : AuditAction.USER_UPDATED;

    await this.auditService.log(adminUserId, action, 'User', saved.id, {
      username: saved.username,
      ...changes,
    });

    return saved;
  }

  async resetPassword(id: string, adminUserId: string): Promise<{ temporaryPassword: string }> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const temporaryPassword = crypto.randomBytes(6).toString('base64url');
    user.passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    await this.usersRepository.save(user);

    await this.auditService.log(
      adminUserId,
      AuditAction.USER_PASSWORD_RESET,
      'User',
      user.id,
      { username: user.username },
    );

    return { temporaryPassword };
  }
}
