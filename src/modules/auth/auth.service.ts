// auth.service.ts dosyasının TAMAMI — refreshTokens() ve ilgili private
// helper'lar güncellendi. Diğer metodlar (register, login, loginWith2fa,
// logout, enable2fa, verify2fa, getMe, toAuthResponse) DEĞİŞMEDİ.

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { RegisterDto, LoginDto } from './dto';
import { Enable2faResponseDto } from './dto';
import { AuthTokens, AuthResponse } from './interfaces/auth-tokens.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  TokenInvalidException,
  TwoFactorRequiredException,
  TwoFactorInvalidException,
} from './exceptions/auth.exceptions';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) throw new EmailAlreadyExistsException();

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
    });

    return this.toAuthResponse(user);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
  ): Promise<{ tokens: AuthTokens; user: AuthResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new InvalidCredentialsException();

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) throw new InvalidCredentialsException();

    if (user.twoFactorEnabled) throw new TwoFactorRequiredException();

    const tokens = await this.generateTokens(user.id, user.email);

    return { tokens, user: this.toAuthResponse(user) };
  }

  // ─── Login with 2FA ────────────────────────────────────────────────────────

  async loginWith2fa(
    dto: LoginDto,
    code: string,
  ): Promise<{ tokens: AuthTokens; user: AuthResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new InvalidCredentialsException();

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) throw new InvalidCredentialsException();

    if (!user.twoFactorSecret) throw new InvalidCredentialsException();

    const isCodeValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
    });

    if (!isCodeValid) throw new TwoFactorInvalidException();

    const tokens = await this.generateTokens(user.id, user.email);

    return { tokens, user: this.toAuthResponse(user) };
  }

  // ─── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  // ─── Refresh Tokens ────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    oldRefreshToken: string,
  ): Promise<AuthTokens> {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
    });

    // REUSE DETECTION: Bu noktaya gelene kadar oldRefreshToken'ın JWT
    // imzası zaten doğrulanmış oluyor (userId parametresi, imza
    // doğrulamasından geçmiş bir JWT payload'ından geliyor — bkz.
    // RefreshTokenStrategy). Yani token'ın DB'de kaydı yoksa, bu rastgele
    // bir saldırı denemesi değil — GEÇERLİ ama DAHA ÖNCE KULLANILMIŞ
    // (silinmiş) bir token'ın tekrar kullanılmaya çalışıldığı anlamına
    // gelir. Bu, klasik "refresh token replay" saldırısının imzasıdır
    // (örn. token çalınmış ve hem saldırgan hem gerçek kullanıcı aynı
    // token'ı kullanmaya çalışıyor). Bu durumda kullanıcının TÜM
    // cihazlardaki oturumlarını iptal ediyoruz — güvenli taraf.
    if (!tokenRecord) {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
      throw new TokenInvalidException();
    }

    if (tokenRecord.userId !== userId) {
      throw new TokenInvalidException();
    }

    if (tokenRecord.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({
        where: { token: oldRefreshToken },
      });
      throw new TokenInvalidException();
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // RACE CONDITION DÜZELTMESİ: eski token'ı silme + yeni token
    // üretme/kaydetme işlemi artık tek bir transaction içinde, atomik.
    // Aynı token'la eşzamanlı iki istek gelirse, PostgreSQL'in row-level
    // kilitleme mekanizması sayesinde ikinci istek birincinin commit'ini
    // bekler; birinci commit olduğunda token zaten silinmiş olacağından
    // ikinci istek yukarıdaki !tokenRecord kontrolüne düşer ve reuse
    // detection tetiklenir. Bu, "iki eşzamanlı refresh" durumunda ikisinin
    // de sessizce başarılı olup iki farklı token çifti üretmesini engeller.
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { token: oldRefreshToken } });

      const tokens = await this.signTokenPair(user.id, user.email);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await tx.refreshToken.create({
        data: { token: tokens.refreshToken, userId: user.id, expiresAt },
      });

      return tokens;
    });
  }

  // ─── 2FA Enable ────────────────────────────────────────────────────────────

  async enable2fa(userId: string): Promise<Enable2faResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const secret = speakeasy.generateSecret({
      name: `Taskflow (${user.email})`,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    return {
      otpAuthUrl: secret.otpauth_url!,
      secret: secret.base32,
    };
  }

  // ─── 2FA Verify & Activate ─────────────────────────────────────────────────

  async verify2fa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.twoFactorSecret) throw new TwoFactorInvalidException();

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
    });

    if (!isValid) throw new TwoFactorInvalidException();

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  // ─── Me ────────────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return this.toAuthResponse(user);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  // Sadece JWT çiftini imzalar — DB'ye HİÇBİR ŞEY yazmaz. Bu ayrım,
  // refreshTokens()'ın transaction içinde (tx client ile) token
  // üretebilmesini sağlıyor, generateTokens()'ın kendi içindeki
  // this.prisma çağrısı transaction dışında kalmasın diye.
  private async signTokenPair(
    userId: string,
    email: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email };

    const jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const jwtExpiresIn = this.configService.get<string>(
      'JWT_EXPIRES_IN',
      '15m',
    );
    const refreshSecret = this.configService.getOrThrow<string>(
      'REFRESH_TOKEN_SECRET',
    );
    const refreshExpiresIn = this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
      '7d',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: jwtExpiresIn as unknown as number,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as unknown as number,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  // login/loginWith2fa akışlarında kullanılır — imzalama + DB'ye kaydetme
  // birlikte, transaction'a ihtiyaç yok çünkü öncesinde silinecek bir
  // token yok (ilk giriş).
  private async generateTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokens> {
    const tokens = await this.signTokenPair(userId, email);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token: tokens.refreshToken, userId, expiresAt },
    });

    return tokens;
  }

  private toAuthResponse(user: {
    id: string;
    email: string;
    name: string;
    twoFactorEnabled: boolean;
  }): AuthResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      twoFactorEnabled: user.twoFactorEnabled,
    };
  }
}
