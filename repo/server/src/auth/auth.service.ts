import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Session } from './session.entity';

const SESSION_TIMEOUT_MS =
  (parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30', 10)) * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(user: User) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const now = new Date();

    const session = this.sessionsRepository.create({
      userId: user.id,
      refreshToken,
      expiresAt: new Date(now.getTime() + SESSION_TIMEOUT_MS),
      lastActivityAt: now,
    });
    await this.sessionsRepository.save(session);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async refresh(refreshToken: string) {
    const session = await this.sessionsRepository.findOne({
      where: { refreshToken },
      relations: ['user'],
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();
    const inactivityMs = now.getTime() - session.lastActivityAt.getTime();

    if (inactivityMs > SESSION_TIMEOUT_MS || session.expiresAt < now) {
      await this.sessionsRepository.remove(session);
      throw new UnauthorizedException('Session expired');
    }

    // Rotate the refresh token on every use
    const newRefreshToken = crypto.randomBytes(48).toString('hex');
    session.refreshToken = newRefreshToken;
    session.lastActivityAt = now;
    session.expiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MS);
    await this.sessionsRepository.save(session);

    const user = session.user;
    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentRefreshToken: string,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must differ from current password');
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.usersRepository.update(userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });

    // Invalidate all sessions for this user except the current one
    await this.sessionsRepository.delete({
      userId,
      refreshToken: Not(currentRefreshToken),
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessionsRepository.delete({ refreshToken });
  }

  async cleanExpiredSessions(): Promise<void> {
    await this.sessionsRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }
}
