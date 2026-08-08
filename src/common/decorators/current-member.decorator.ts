import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WorkspaceMember } from '@prisma/client';
import { TaskflowRequest } from '../types/request.type';

export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceMember => {
    const request = ctx.switchToHttp().getRequest<TaskflowRequest>();
    return request.workspaceMember!;
  },
);
