import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto, ChangePasswordDto } from './dto';
import {
  UserNotFoundException,
  InvalidPasswordException,
} from './exceptions/user.exceptions';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get Profile ───────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            workspaceMemberships: true,
          },
        },
      },
    });

    if (!user) throw new UserNotFoundException();

    return user;
  }

  // ─── Update Profile ────────────────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserNotFoundException();

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        twoFactorEnabled: true,
        updatedAt: true,
      },
    });
  }

  // ─── Change Password ───────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserNotFoundException();

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) throw new InvalidPasswordException();

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Tüm refresh token'ları iptal et — şifre değişince tüm oturumlar sonlanır
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  // ─── Delete Account ────────────────────────────────────────────────────────

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserNotFoundException();

    // Cascade ile tüm ilişkili veriler silinir
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
