import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AUTH_CONSTANTS } from '../constants/auth.constants';
import {
  JwtPayload,
  JwtRefreshPayload,
} from '../interfaces/jwt-payload.interface';
import { TokenInvalidException } from '../exceptions/auth.exceptions';
import { AuthenticatedUser, UserId } from '../types/authenticated-user.type';

// ─── Access Token Strategy ───────────────────────────────────────────────────
// Cookie'den veya Authorization header'dan access token okur.
// validate() dönüşü → request.user'a atanır → @CurrentUser() ile alınır.

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
  AUTH_CONSTANTS.JWT_STRATEGY,
) {
  constructor(private readonly configService: ConfigService) {
    super({
      // Önce cookie'ye bak, yoksa Authorization header'a bak
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          (req?.cookies?.[AUTH_CONSTANTS.ACCESS_TOKEN_COOKIE] as string) ??
          null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: unknown): AuthenticatedUser {
    const { sub, email } = payload as JwtPayload;
    return {
      id: sub as unknown as UserId,
      email,
    };
  }
}

// ─── Refresh Token Strategy ───────────────────────────────────────────────────
// Sadece refresh endpoint'inde kullanılır.
// Cookie'den refresh token okur, payload'a ham token'ı da ekler.
// AuthService.refreshTokens()'da token rotasyonu için ham token lazım.

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  AUTH_CONSTANTS.JWT_REFRESH_STRATEGY,
) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          (req?.cookies?.[AUTH_CONSTANTS.REFRESH_TOKEN_COOKIE] as string) ??
          null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
      passReqToCallback: true, // validate()'e request'i de gönder → ham token için
    });
  }

  validate(req: Request, payload: JwtPayload): JwtRefreshPayload {
    const refreshToken = req.cookies?.[
      AUTH_CONSTANTS.REFRESH_TOKEN_COOKIE
    ] as string;

    if (!refreshToken) throw new TokenInvalidException();

    return {
      ...payload,
      refreshToken,
    };
  }
}
