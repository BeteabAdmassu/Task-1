import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditAction } from '../common/enums/audit-action.enum';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async log(
    userId: string,
    action: AuditAction,
    targetEntity: string,
    targetId: string | null,
    details: Record<string, unknown> = {},
  ): Promise<AuditLog> {
    const entry = this.auditRepository.create({
      userId,
      action,
      targetEntity,
      targetId,
      details,
    });
    return this.auditRepository.save(entry);
  }
}
