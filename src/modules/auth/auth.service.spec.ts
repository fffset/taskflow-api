import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EmailAlreadyExistsException,
  InvalidCredentialsException,
} from './exceptions/auth.exceptions';
import * as bcrypt from 'bcrypt';

// Prisma mock
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock_token'),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('mock_secret'),
  get: jest.fn().mockReturnValue('15m'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('kullanıcı başarıyla kaydedilmeli', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user_1',
        email: 'test@test.com',
        name: 'Test User',
        twoFactorEnabled: false,
      });

      const result = await service.register({
        email: 'test@test.com',
        password: 'StrongPass123!',
        name: 'Test User',
      });

      expect(result.email).toBe('test@test.com');
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('email zaten varsa EmailAlreadyExistsException fırlatmalı', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_1' });

      await expect(
        service.register({
          email: 'test@test.com',
          password: 'StrongPass123!',
          name: 'Test User',
        }),
      ).rejects.toThrow(EmailAlreadyExistsException);
    });
  });

  describe('login', () => {
    it('geçerli credentials ile login olunmalı', async () => {
      const hashedPassword = await bcrypt.hash('StrongPass123!', 12);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@test.com',
        name: 'Test User',
        passwordHash: hashedPassword,
        twoFactorEnabled: false,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: 'test@test.com',
        password: 'StrongPass123!',
      });

      expect(result.user.email).toBe('test@test.com');
      expect(result.tokens.accessToken).toBe('mock_token');
    });

    it('yanlış şifre ile InvalidCredentialsException fırlatmalı', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@test.com',
        passwordHash: await bcrypt.hash('correct_password', 12),
        twoFactorEnabled: false,
      });

      await expect(
        service.login({
          email: 'test@test.com',
          password: 'wrong_password',
        }),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it('kullanıcı bulunamazsa InvalidCredentialsException fırlatmalı', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'notfound@test.com',
          password: 'StrongPass123!',
        }),
      ).rejects.toThrow(InvalidCredentialsException);
    });
  });

  describe('logout', () => {
    it("tüm refresh token'lar silinmeli", async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.logout('user_1');

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_1' },
      });
    });
  });
});
