import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';

/**
 * Runs once after all modules are initialized (after migrations).
 *
 * Security rule: bootstrap credentials are applied ONLY when the users table is
 * completely empty (total count = 0).  Once any user exists the bootstrap step
 * is skipped unconditionally, so a leaked ADMIN_BOOTSTRAP_PASSWORD env var
 * cannot be used to reset or duplicate the admin account in a live system.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const totalUsers = await this.userRepo.count();

    if (totalUsers > 0) {
      this.logger.log('Skipping admin bootstrap: users already exist.');
      return;
    }

    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    const bootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME ?? 'admin';

    if (!bootstrapPassword) {
      this.logger.error(
        '══════════════════════════════════════════════════════════════════\n' +
          '  NO USERS EXIST AND NO ADMIN BOOTSTRAP PASSWORD PROVIDED.\n' +
          '  Set ADMIN_BOOTSTRAP_PASSWORD (and optionally ADMIN_BOOTSTRAP_USERNAME)\n' +
          '  env vars, then restart the server to create the initial admin.\n' +
          '  Example: ADMIN_BOOTSTRAP_PASSWORD=<strong-password> npm run start\n' +
          '══════════════════════════════════════════════════════════════════',
      );
      return;
    }

    const passwordHash = await bcrypt.hash(bootstrapPassword, 10);
    const admin = this.userRepo.create({
      username: bootstrapUsername,
      passwordHash,
      role: Role.ADMINISTRATOR,
      isActive: true,
      mustChangePassword: false,
    });
    await this.userRepo.save(admin);
    this.logger.log(`Bootstrap admin created: username="${bootstrapUsername}"`);
  }
}
