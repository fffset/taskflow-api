import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TaskflowRequest } from '../types/request.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest<TaskflowRequest>().user;
  },
);
