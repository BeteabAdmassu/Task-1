import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';

/**
 * Runs once after all modules are initialized (after migrations).
 * Validates that an administrator account exists, and warns loudly if not.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const adminCount = await this.userRepo.count({
      where: { role: Role.ADMINISTRATOR, isActive: true },
    });

    if (adminCount === 0) {
      this.logger.error(
        '══════════════════════════════════════════════════════════════════\n' +
          '  NO ADMINISTRATOR ACCOUNT EXISTS.\n' +
          '  Set ADMIN_BOOTSTRAP_PASSWORD (and optionally ADMIN_BOOTSTRAP_USERNAME)\n' +
          '  env vars, then restart the server to create the initial admin.\n' +
          '  Example: ADMIN_BOOTSTRAP_PASSWORD=<strong-password> npm run start\n' +
          '══════════════════════════════════════════════════════════════════',
      );
    }
  }
}
