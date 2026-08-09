// worker/email/email.service.ts dosyasının tamamı — sendWorkspaceInvite()
// artık async değil, diğer iki metod da tutarlılık için aynı şekilde
// senkron. Gerçek SMTP eklendiğinde (Faz 2.16) tekrar async/Promise<void>
// yapılacak.

import { Injectable, Logger } from '@nestjs/common';
import type {
  MentionNotificationPayload,
  TaskAssignedPayload,
  WorkspaceInvitePayload,
} from '../../queue/email-publisher.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  sendMentionNotification(payload: MentionNotificationPayload): void {
    this.logger.log(
      `[SIMÜLASYON] Email gönderildi → userId=${payload.toUserId}: ` +
        `"${payload.mentionedByName}" seni "${payload.taskTitle}" task'ında etiketledi`,
    );
    // TODO: gerçek SMTP entegrasyonu — async/Promise<void> olacak
  }

  sendTaskAssigned(payload: TaskAssignedPayload): void {
    this.logger.log(
      `[SIMÜLASYON] Email gönderildi → userId=${payload.toUserId}: ` +
        `"${payload.assignedByName}" sana "${payload.taskTitle}" task'ını atadı`,
    );
    // TODO: gerçek SMTP entegrasyonu — async/Promise<void> olacak
  }

  sendWorkspaceInvite(payload: WorkspaceInvitePayload): void {
    // GÜVENLİK: inviteToken'ı loglama! Bu token, tek başına (ek doğrulama
    // olmadan, sadece email eşleşmesiyle) workspace'e erişim veren bir
    // bearer sırrı. Gerçek SMTP entegrasyonunda token sadece email
    // gövdesindeki (link içindeki) yerinde olmalı, hiçbir log satırına
    // yazılmamalı.
    this.logger.log(
      `[SIMÜLASYON] Davet email'i gönderildi → email=${payload.toEmail}: ` +
        `"${payload.workspaceName}" workspace'ine davet edildin`,
    );
    // TODO: gerçek SMTP entegrasyonu — async/Promise<void> olacak
  }
}
