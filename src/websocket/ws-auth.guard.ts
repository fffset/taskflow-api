import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedSocket } from './authenticated-socket.type';
import { extractTokenFromHandshake } from './extract-token.util';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: AuthenticatedSocket = context.switchToWs().getClient();
    const token = extractTokenFromHandshake(client);

    if (!token) {
      this.logger.warn('WebSocket bağlantısı token olmadan reddedildi');
      return false;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.data.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      this.logger.warn('WebSocket bağlantısı geçersiz token ile reddedildi');
      return false;
    }
  }
}
