import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtRefreshGuard } from './guards/jwt.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { JwtRefreshPayload } from './interfaces/jwt-payload.interface';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import { Login2faDto, LoginDto, RegisterDto, Verify2faDto } from './dto';
import { Throttle } from '@nestjs/throttler';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

@Throttle({ short: { ttl: 60000, limit: 5 } })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Yeni kullanıcı kaydı' })
  @ApiResponse({ status: 201, description: 'Kayıt başarılı' })
  @ApiResponse({ status: 409, description: 'Email zaten kayıtlı' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Giriş yap' })
  @ApiResponse({ status: 200, description: 'Giriş başarılı' })
  @ApiResponse({
    status: 401,
    description: 'Hatalı credentials veya 2FA gerekli',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.login(dto);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  // ─── Login with 2FA ────────────────────────────────────────────────────────

  @Public()
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2FA ile giriş yap' })
  async loginWith2fa(
    @Body() dto: Login2faDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.loginWith2fa(dto, dto.code);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  // ─── Logout ────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Çıkış yap' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id);
    res.clearCookie(AUTH_CONSTANTS.ACCESS_TOKEN_COOKIE);
    res.clearCookie(AUTH_CONSTANTS.REFRESH_TOKEN_COOKIE);
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  @Throttle({ short: { ttl: 60000, limit: 20 } })
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token yenile' })
  async refresh(
    @CurrentUser() user: JwtRefreshPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refreshTokens(
      user.sub,
      user.refreshToken,
    );
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Tokens refreshed' };
  }

  // ─── Me ────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mevcut kullanıcı bilgisi' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  // ─── 2FA Enable ────────────────────────────────────────────────────────────

  @Post('2fa/enable')
  @ApiBearerAuth()
  @ApiOperation({ summary: '2FA aktifleştir — QR code URL döner' })
  async enable2fa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.enable2fa(user.id);
  }

  // ─── 2FA Verify ────────────────────────────────────────────────────────────

  @Post('2fa/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '2FA kodunu doğrula ve aktif et' })
  async verify2fa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Verify2faDto,
  ) {
    await this.authService.verify2fa(user.id, dto.code);
  }

  // ─── Private Helper ────────────────────────────────────────────────────────

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie(AUTH_CONSTANTS.ACCESS_TOKEN_COOKIE, accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000, // 15 dakika
    });
    res.cookie(AUTH_CONSTANTS.REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
    });
  }
}
