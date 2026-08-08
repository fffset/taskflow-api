import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { RABBITMQ_CONSTANTS, EMAIL_PATTERNS } from './rabbitmq.constants';

export interface MentionNotificationPayload {
  toUserId: string;
  taskTitle: string;
  taskId: string;
  mentionedByName: string;
}

export interface TaskAssignedPayload {
  toUserId: string;
  taskTitle: string;
  taskId: string;
  assignedByName: string;
}

export interface WorkspaceInvitePayload {
  toEmail: string;
  workspaceName: string;
  inviteToken: string;
}

@Injectable()
export class EmailPublisherService {
  private readonly logger = new Logger(EmailPublisherService.name);

  constructor(
    @Inject(RABBITMQ_CONSTANTS.WORKER_SERVICE)
    private readonly client: ClientProxy,
  ) {}

  publishMentionNotification(payload: MentionNotificationPayload): void {
    this.emit(EMAIL_PATTERNS.MENTION_NOTIFICATION, payload);
  }

  publishTaskAssigned(payload: TaskAssignedPayload): void {
    this.emit(EMAIL_PATTERNS.TASK_ASSIGNED, payload);
  }

  publishWorkspaceInvite(payload: WorkspaceInvitePayload): void {
    this.emit(EMAIL_PATTERNS.WORKSPACE_INVITE, payload);
  }

  private emit(pattern: string, payload: unknown): void {
    try {
      this.client.emit(pattern, payload);
    } catch (error) {
      this.logger.error(`RabbitMQ'ya mesaj gönderilemedi: ${pattern}`, error);
    }
  }
}
