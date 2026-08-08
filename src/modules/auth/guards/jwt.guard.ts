import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

// ─── JwtAuthGuard ─────────────────────────────────────────────────────────────
// Global olarak tüm route'lara uygulanır (app.module'da APP_GUARD olarak).
// @Public() decorator'ı olan route'ları atlar.

@Injectable()
export class JwtAuthGuard extends AuthGuard(AUTH_CONSTANTS.JWT_STRATEGY) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // @Public() varsa guard'ı bypass et
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }
}

// ─── JwtRefreshGuard ──────────────────────────────────────────────────────────
// Sadece /auth/refresh endpoint'inde kullanılır.
// Refresh token strategy'yi tetikler.

@Injectable()
export class JwtRefreshGuard extends AuthGuard(
  AUTH_CONSTANTS.JWT_REFRESH_STRATEGY,
) {}
