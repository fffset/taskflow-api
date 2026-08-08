import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { WorkspaceGateway } from './workspace.gateway';
import { WsAuthGuard } from './ws-auth.guard';

@Module({
  imports: [ConfigModule, JwtModule.register({})], // secret her verify çağrısında ConfigService'ten okunuyor
  providers: [WorkspaceGateway, WsAuthGuard],
  exports: [WorkspaceGateway],
})
export class WebsocketModule {}
