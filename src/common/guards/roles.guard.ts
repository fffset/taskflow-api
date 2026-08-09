import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceMember, WorkspaceRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { WorkspaceForbiddenException } from '../../modules/workspaces/exceptions/workspace.exceptions';

interface RequestWithMember {
  workspaceMember?: WorkspaceMember;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithMember>();
    const member = request.workspaceMember;

    if (!member) {
      throw new WorkspaceForbiddenException();
    }

    if (!requiredRoles.includes(member.role)) {
      throw new WorkspaceForbiddenException();
    }

    return true;
  }
}
