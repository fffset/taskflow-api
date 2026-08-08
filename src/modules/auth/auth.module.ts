import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy, JwtRefreshStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt.guard';

@Module({
  imports: [
    PassportModule,
    // JwtModule'ü async config olmadan import ediyoruz çünkü her signAsync çağrısında
    // secret'ı ayrıca geçiyoruz (access ve refresh farklı secret kullanıyor)
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
