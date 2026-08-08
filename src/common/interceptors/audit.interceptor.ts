import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';
import { TaskflowRequest } from '../types/request.type';

const METHOD_ACTION_MAP: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PATCH: AuditAction.UPDATE,
  PUT: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
};

function extractEntity(path: string): string | null {
  const segments = path
    .replace(/\/api\/v\d+\//, '')
    .split('/')
    .filter(Boolean);

  const entitySegments = segments.filter(
    (s) => !s.match(/^[a-z0-9]{20,}$/) && !s.match(/^[0-9a-f-]{36}$/),
  );

  const last = entitySegments[entitySegments.length - 1];
  if (!last) return null;

  const singularMap: Record<string, string> = {
    workspaces: 'workspace',
    projects: 'project',
    boards: 'board',
    tasks: 'task',
    labels: 'label',
    members: 'member',
    comments: 'comment',
    statuses: 'status',
    notifications: 'notification',
  };

  return singularMap[last] ?? last;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<TaskflowRequest>();
    const { method, url, params } = request;

    const action = METHOD_ACTION_MAP[method];
    if (!action) return next.handle();

    const isAuthRoute = url.includes('/auth/');
    const workspaceId = params['workspaceId'] as string | undefined;
    const userId = request.user?.id;

    if (!userId) return next.handle();

    if (isAuthRoute && !url.includes('/login') && !url.includes('/logout')) {
      return next.handle();
    }

    const entity = extractEntity(url) ?? 'unknown';
    const entityId = (params['taskId'] ??
      params['projectId'] ??
      params['boardId'] ??
      params['labelId'] ??
      params['workspaceId'] ??
      params['userId'] ??
      'unknown') as string;

    // UPDATE ve DELETE için before verisini önceden çek
    const beforePromise =
      action === AuditAction.UPDATE || action === AuditAction.DELETE
        ? this.fetchBefore(entity, entityId, workspaceId ?? '')
        : Promise.resolve(null);

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          void beforePromise.then((before) => {
            void this.logAudit(
              request,
              action,
              workspaceId,
              userId,
              entity,
              entityId,
              before,
              responseBody,
            );
          });
        },
      }),
    );
  }

  private async fetchBefore(
    entity: string,
    entityId: string,
    workspaceId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      switch (entity) {
        case 'task':
          return await this.prisma.task.findFirst({
            where: { id: entityId, workspaceId },
          });

        case 'project':
          return await this.prisma.project.findFirst({
            where: { id: entityId, workspaceId },
          });

        case 'board':
          return await this.prisma.board.findFirst({
            where: { id: entityId },
          });

        case 'workspace':
          return await this.prisma.workspace.findFirst({
            where: { id: entityId },
          });

        case 'label':
          return await this.prisma.label.findFirst({
            where: { id: entityId },
          });

        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private async logAudit(
    request: TaskflowRequest,
    action: AuditAction,
    workspaceId: string | undefined,
    userId: string,
    entity: string,
    entityId: string,
    before: Record<string, unknown> | null,
    responseBody: unknown,
  ): Promise<void> {
    try {
      if (!workspaceId) return;

      const resolvedEntityId =
        ((responseBody as Record<string, unknown>)?.['id'] as string) ??
        entityId;

      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action,
          entity,
          entityId: resolvedEntityId,
          before: before ? (before as Prisma.InputJsonValue) : undefined,
          after: responseBody
            ? (responseBody as Prisma.InputJsonValue)
            : undefined,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });
    } catch {
      // Audit log hatası ana işlemi etkilemesin
    }
  }
}
