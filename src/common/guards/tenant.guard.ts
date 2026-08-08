import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskflowRequest } from '../types/request.type';
import {
  WorkspaceForbiddenException,
  WorkspaceNotFoundException,
} from 'src/modules/workspaces/exceptions/workspace.exceptions';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TaskflowRequest>();
    const workspaceId = request.params['workspaceId'];
    const userId = request.user?.id;

    if (!workspaceId) return true; // workspace gerektirmeyen route

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId as string },
    });

    if (!workspace) throw new WorkspaceNotFoundException();

    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspaceId as string, userId },
      },
    });

    if (!member) throw new WorkspaceForbiddenException();

    // request'e ekle — controller/service tekrar DB'ye gitmesin
    request.workspaceMember = member;

    return true;
  }
}
