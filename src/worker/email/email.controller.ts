// worker/email/email.controller.ts dosyasının tamamı

import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EMAIL_PATTERNS } from '../../queue/rabbitmq.constants';
import { EmailService } from './email.service';
import type {
  MentionNotificationPayload,
  TaskAssignedPayload,
  WorkspaceInvitePayload,
} from '../../queue/email-publisher.service';

@Controller()
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @EventPattern(EMAIL_PATTERNS.MENTION_NOTIFICATION)
  handleMentionNotification(@Payload() payload: MentionNotificationPayload) {
    this.emailService.sendMentionNotification(payload);
  }

  @EventPattern(EMAIL_PATTERNS.TASK_ASSIGNED)
  handleTaskAssigned(@Payload() payload: TaskAssignedPayload) {
    this.emailService.sendTaskAssigned(payload);
  }

  @EventPattern(EMAIL_PATTERNS.WORKSPACE_INVITE)
  handleWorkspaceInvite(@Payload() payload: WorkspaceInvitePayload) {
    this.emailService.sendWorkspaceInvite(payload);
  }
}
