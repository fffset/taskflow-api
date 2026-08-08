import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { WsAuthGuard } from './ws-auth.guard';
import type { AuthenticatedSocket } from './authenticated-socket.type';

interface JwtPayload {
  sub: string;
  email: string;
}

function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class WorkspaceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WorkspaceGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    server.use((socket: AuthenticatedSocket, next) => {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.query?.token as string | undefined);

      if (!token) {
        return next(new Error('Unauthorized: token gerekli'));
      }

      try {
        const payload = this.jwtService.verify<JwtPayload>(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        });
        socket.data.user = { id: payload.sub, email: payload.email };
        next();
      } catch {
        next(new Error('Unauthorized: geçersiz token'));
      }
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client bağlandı: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ayrıldı: ${client.id}`);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('workspace:join')
  handleJoinWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { workspaceId: string },
  ) {
    void client.join(workspaceRoom(data.workspaceId));
    this.logger.log(
      `Kullanıcı ${client.data.user.id} workspace:${data.workspaceId} odasına katıldı`,
    );
    return {
      event: 'workspace:joined',
      data: { workspaceId: data.workspaceId },
    };
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('workspace:leave')
  handleLeaveWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { workspaceId: string },
  ) {
    void client.leave(workspaceRoom(data.workspaceId));
    return { event: 'workspace:left', data: { workspaceId: data.workspaceId } };
  }

  emitTaskCreated(workspaceId: string, task: unknown): void {
    this.server.to(workspaceRoom(workspaceId)).emit('task:created', task);
  }

  emitTaskUpdated(workspaceId: string, task: unknown): void {
    this.server.to(workspaceRoom(workspaceId)).emit('task:updated', task);
  }

  emitTaskDeleted(workspaceId: string, taskId: string): void {
    this.server.to(workspaceRoom(workspaceId)).emit('task:deleted', { taskId });
  }

  emitCommentAdded(
    workspaceId: string,
    taskId: string,
    comment: unknown,
  ): void {
    this.server
      .to(workspaceRoom(workspaceId))
      .emit('comment:added', { taskId, comment });
  }
}
